#!/usr/bin/env node

/**
 * Sync products from Firestore → CDON Merchant API.
 *
 * Reads /partners/{PARTNER_ID}/products/, creates one CDON article per variant,
 * POSTs to https://merchants-api.cdon.com/api/v2/articles.
 *
 * Defaults to --dry-run (logs payloads, no POST). Pass --live to actually send.
 *
 * Usage:
 *   node scripts/sync-cdon.mjs                 # dry-run, all products
 *   node scripts/sync-cdon.mjs --live          # POST to CDON
 *   node scripts/sync-cdon.mjs --product Luigi # filter by product title
 *   node scripts/sync-cdon.mjs --live --only 100-10-12  # single SKU
 *   node scripts/sync-cdon.mjs --check 100-10-12       # GET article status from CDON
 *   node scripts/sync-cdon.mjs --check-all             # GET status for every mapped SKU
 *   node scripts/sync-cdon.mjs --list                  # GET all articles currently on CDON
 *   node scripts/sync-cdon.mjs --push 100-10-12        # build + POST a single SKU live, dump full response
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir, tmpdir } from 'os';
import { SKU_MAP, lookupSkuGtin } from './cdon-sku-map.mjs';

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const PARTNER_ID = 'hemdeal-ab';
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'valter-crm';

const CDON_BASE_URL = 'https://merchants-api.cdon.com/api';
const CDON_MERCHANT_ID = '28375ab8-261d-49ca-84fa-23f5fdfa608d';
const CDON_TOKEN = 'bcb579bc-166e-453e-9b79-c36872645a62';

const MARKET = 'SE';
const CURRENCY = 'SEK';
const LANGUAGE = 'sv-SE';
const VAT_RATE = 0.25;
const SHIPPING_MIN_DAYS = 3;
const SHIPPING_MAX_DAYS = 5;
const DELIVERY_TYPE = 'home_delivery';
const SHIPPED_FROM = 'EU';
const DEFAULT_CATEGORY = '1586'; // Badrumsspeglar
const KN_NUMBER = '7009 92 00 00';
const THROTTLE_MS = 200;

const MANUFACTURER = {
  name: 'Hemdeal AB',
  address: {
    street_address: 'Hantverkarvägen 26, Box 3005',
    city: 'Stockholm',
    postal_code: '136 03',
    country: 'SE',
  },
  website: 'https://hemdeal.se/',
  email: 'kundservice@hemdeal.se',
  responsible_person: {
    name: 'Loke Eriksson',
    phone: '+46-76-014-47-50',
    email: 'loke.eriksson@hemdeal.se',
    address: {
      street_address: 'Bidevindsgränd 12 lgh 1307',
      city: 'Stockholm',
      postal_code: '136 55',
      country: 'SE',
    },
  },
};

// SKU_MAP / normalizeSize / lookupSkuGtin live in ./cdon-sku-map.mjs (shared).
// ────────────────────────────────────────────────────────────────────────────

// Firebase CLI OAuth2 client (public, embedded in firebase-tools source)
const FIREBASE_CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

const args = process.argv.slice(2);
const CHECK_ALL = args.includes('--check-all');
const LIST_ALL = args.includes('--list');
const productFilter = argValue('--product');
const checkSku = argValue('--check');
const pushSku = argValue('--push');
// --push forces live mode + single-SKU filter
const LIVE = args.includes('--live') || !!pushSku;
const onlySku = pushSku || argValue('--only');

function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

function log(msg)  { console.log(msg); }
function ok(msg)   { console.log(`  ✓ ${msg}`); }
function warn(msg) { console.log(`  ⚠ ${msg}`); }
function fail(msg) { console.log(`  ✗ ${msg}`); }

function setupADCFromFirebaseCLI() {
  const configPath = join(homedir(), '.config', 'configstore', 'firebase-tools.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const refresh = config.tokens?.refresh_token;
  if (!refresh) throw new Error('No refresh_token in firebase-tools config. Run: firebase login');

  const adcJson = JSON.stringify({
    client_id: FIREBASE_CLI_CLIENT_ID,
    client_secret: FIREBASE_CLI_CLIENT_SECRET,
    refresh_token: refresh,
    type: 'authorized_user',
  });
  const tmpPath = join(tmpdir(), 'firebase-cdon-adc.json');
  writeFileSync(tmpPath, adcJson, { mode: 0o600 });
  process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpPath;
}

// Normalise a product doc into one or more CDON "items", supporting BOTH the
// legacy embedded-variant shape and the new flat-article shape (one doc per
// article, no variants[]). Each item carries everything buildArticle needs.
function toItems(product) {
  if (Array.isArray(product.variants) && product.variants.length) {
    return product.variants.map((v) => ({
      fullTitle: `${product.title} – ${v.title}`,
      brandTitle: product.title, // for SKU_MAP brand keyword match
      size: v.title,
      price: v.price,
      stock: v.stock,
      imageUrl: v.imageUrl || product.imageUrl,
      description: product.description,
      vendor: product.vendor,
      status: product.status,
      cdonCategoryId: product.cdonCategoryId,
    }));
  }
  // Flat article: the doc itself is the article. Derive the size from the part
  // after the en dash in the title (e.g. "Luigi spegel – 40x40" → "40x40").
  const dashIdx = product.title.lastIndexOf('–');
  const size = dashIdx >= 0 ? product.title.slice(dashIdx + 1).trim() : product.title;
  return [{
    fullTitle: product.title,
    brandTitle: product.groupTitle || product.title,
    size,
    price: product.price,
    stock: product.stock,
    imageUrl: product.imageUrl,
    description: product.description,
    vendor: product.vendor,
    status: product.status,
    cdonCategoryId: product.cdonCategoryId,
  }];
}

function buildArticle(item, mapping) {
  const priceAmount = Number(item.price);
  const stock = Math.max(0, Math.floor(Number(item.stock) || 0));
  const status = item.status === 'active' && stock > 0 ? 'for sale' : 'paused';
  const mainImage = item.imageUrl;
  const description = (item.description || '').trim() || item.fullTitle;

  const isFranklin = mapping.brand === 'Franklin';
  const properties = [
    { name: 'size',      value: item.size, language: LANGUAGE },
    { name: 'weight_kg', value: String(mapping.weightKg) },
  ];

  const article = {
    sku: mapping.sku,
    status,
    quantity: stock,
    main_image: mainImage,
    markets: [MARKET],
    title: [{ language: LANGUAGE, value: item.fullTitle }],
    description: [{ language: LANGUAGE, value: description }],
    price: [
      {
        market: MARKET,
        value: {
          amount_including_vat: priceAmount,
          currency: CURRENCY,
          vat_rate: VAT_RATE,
        },
      },
    ],
    shipping_time: [{ market: MARKET, min: SHIPPING_MIN_DAYS, max: SHIPPING_MAX_DAYS }],
    delivery_type: [{ market: MARKET, value: DELIVERY_TYPE }],
    brand: item.vendor || MANUFACTURER.name,
    gtin: mapping.gtin,
    category: item.cdonCategoryId || DEFAULT_CATEGORY,
    shipped_from: SHIPPED_FROM,
    kn_number: KN_NUMBER,
    manufacturer: MANUFACTURER,
    properties,
  };

  if (isFranklin) {
    article.unique_selling_points = [{ language: LANGUAGE, value: ['Anti-fog'] }];
  }

  return article;
}

function validate(article, ctx) {
  const errors = [];
  if (!article.main_image) errors.push('missing main_image');
  if (!(article.quantity >= 0)) errors.push('invalid quantity');
  if (!article.price?.[0]?.value?.amount_including_vat) errors.push('missing price');
  if (article.sku.length < 1 || article.sku.length > 64) errors.push('sku length');
  return errors;
}

async function getArticle(sku) {
  const auth = Buffer.from(`${CDON_MERCHANT_ID}:${CDON_TOKEN}`).toString('base64');
  const res = await fetch(`${CDON_BASE_URL}/v2/articles/${encodeURIComponent(sku)}`, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, ok: res.ok, body };
}

function summarizeArticle(sku, res) {
  log(`\n▸ ${sku} → HTTP ${res.status}`);
  if (!res.ok) {
    fail(typeof res.body === 'string' ? res.body : JSON.stringify(res.body, null, 2));
    return;
  }
  const a = res.body || {};
  // CDON shape varies; try to surface the useful bits without assuming.
  const status = a.status ?? a.article?.status;
  const validation = a.validation_errors ?? a.errors ?? a.article?.validation_errors;
  const matches   = a.category_match ?? a.article?.category_match;
  const markets   = a.markets ?? a.article?.markets;
  const quantity  = a.quantity ?? a.article?.quantity;
  if (status   !== undefined) ok(`status   : ${status}`);
  if (quantity !== undefined) ok(`quantity : ${quantity}`);
  if (markets)                ok(`markets  : ${JSON.stringify(markets)}`);
  if (matches)                ok(`category : ${JSON.stringify(matches)}`);
  if (validation && (Array.isArray(validation) ? validation.length : Object.keys(validation).length)) {
    fail(`validation_errors:\n${JSON.stringify(validation, null, 2)}`);
  }
  // Always dump full body for completeness
  log('\nFull response:');
  console.log(JSON.stringify(a, null, 2));
}

async function checkSkus(skus) {
  for (const sku of skus) {
    try {
      const res = await getArticle(sku);
      summarizeArticle(sku, res);
    } catch (e) {
      fail(`${sku} → ${e.message}`);
    }
    if (skus.length > 1) await new Promise((r) => setTimeout(r, THROTTLE_MS));
  }
}

async function listArticles() {
  const auth = Buffer.from(`${CDON_MERCHANT_ID}:${CDON_TOKEN}`).toString('base64');
  const res = await fetch(`${CDON_BASE_URL}/v2/articles`, {
    method: 'GET',
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, ok: res.ok, body };
}

async function postArticlesBulk(articles) {
  const auth = Buffer.from(`${CDON_MERCHANT_ID}:${CDON_TOKEN}`).toString('base64');
  const res = await fetch(`${CDON_BASE_URL}/v2/articles/bulk`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ articles }),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, ok: res.ok, body };
}

async function main() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(` CDON Sync`);
  log(` Project : ${PROJECT_ID}`);
  log(` Partner : ${PARTNER_ID}`);
  const mode =
    pushSku ? `PUSH ONE (live, sku=${pushSku})`
    : LIST_ALL ? 'LIST (GET all)'
    : (checkSku || CHECK_ALL) ? 'CHECK (GET status)'
    : LIVE ? 'LIVE (POSTing)'
    : 'DRY-RUN (no POST)';
  log(` Mode    : ${mode}`);
  if (productFilter) log(` Filter  : product=${productFilter}`);
  if (onlySku)       log(` Filter  : sku=${onlySku}`);
  if (checkSku)      log(` Check   : sku=${checkSku}`);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (checkSku) {
    await checkSkus([checkSku]);
    return;
  }
  if (CHECK_ALL) {
    await checkSkus(SKU_MAP.map((m) => m.sku));
    return;
  }
  if (LIST_ALL) {
    log('Fetching all articles from CDON...');
    const res = await listArticles();
    log(`\n→ HTTP ${res.status}`);
    console.log(JSON.stringify(res.body, null, 2));
    return;
  }

  setupADCFromFirebaseCLI();
  initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore();

  const snap = await db.collection(`partners/${PARTNER_ID}/products`).get();
  if (snap.empty) { log('No products found.'); return; }

  const results = { built: [], failed: [], skipped: [] };
  const batch = []; // articles to send in one bulk POST

  for (const docSnap of snap.docs) {
    const product = { id: docSnap.id, ...docSnap.data() };
    if (productFilter && !product.title?.toLowerCase().includes(productFilter.toLowerCase())) continue;

    log(`\n▸ ${product.title} (${product.id})`);

    for (const item of toItems(product)) {
      const label = item.fullTitle;
      const mapping = lookupSkuGtin(item.brandTitle, item.size);

      if (!mapping) {
        warn(`${label} → no SKU/GTIN mapping, skipping`);
        results.skipped.push({ label, reason: 'no SKU mapping' });
        continue;
      }
      if (onlySku && mapping.sku !== onlySku) continue;

      const article = buildArticle(item, mapping);
      const errs = validate(article);
      if (errs.length) {
        fail(`${label} [${mapping.sku}] → invalid: ${errs.join(', ')}`);
        results.failed.push({ label, sku: mapping.sku, error: errs.join(', ') });
        continue;
      }
      if (!article.gtin) warn(`${label} [${mapping.sku}] → no GTIN (allowed but flagged)`);

      ok(`${label} [${mapping.sku}] → built (${article.quantity} in stock, ${article.status})`);
      results.built.push({ label, sku: mapping.sku });
      batch.push(article);
    }
  }

  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(` Built   : ${results.built.length} article(s)`);
  log(` Failed  : ${results.failed.length}`);
  log(` Skipped : ${results.skipped.length}`);
  if (results.failed.length) {
    log('\n Failures:');
    for (const f of results.failed) log(`   - ${f.label} [${f.sku}]: ${f.error}`);
  }
  if (results.skipped.length) {
    log('\n Skipped:');
    for (const s of results.skipped) log(`   - ${s.label}: ${s.reason}`);
  }
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (!LIVE) {
    log('DRY-RUN payload (one batch):');
    console.log(JSON.stringify({ articles: batch }, null, 2));
    log('\nRe-run with --live to POST this batch to CDON.\n');
    return;
  }

  if (batch.length === 0) {
    log('Nothing to POST.\n');
    return;
  }

  log(`Sending ${batch.length} article(s) in one bulk POST...\n`);
  try {
    const res = await postArticlesBulk(batch);
    log(`\n→ HTTP ${res.status} (ok=${res.ok})`);
    log('Full response body:');
    console.log(typeof res.body === 'string' ? res.body : JSON.stringify(res.body, null, 2));
    if (!res.ok) process.exit(1);
  } catch (e) {
    fail(`Bulk POST → ${e.message}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('\nFatal:', e);
  process.exit(1);
});
