#!/usr/bin/env node

/**
 * Verify multi-channel stock sync: CRM (source of truth) vs Shopify vs CDON.
 *
 * READ-ONLY — never writes anywhere. For every linked article it fetches the
 * live "available" quantity from Shopify and/or CDON and diffs it against the
 * CRM stock. Any mismatch is drift: either a push failed silently or someone
 * edited a channel directly.
 *
 * Credentials are read from each partner's Firestore integration docs
 * (partners/{id}/integrations/{shopify,cdon}) — same source the Cloud
 * Functions use. Firestore access uses the Firebase CLI login (firebase login).
 *
 * Usage:
 *   node scripts/verify-sync.mjs                    # all partners, both channels
 *   node scripts/verify-sync.mjs --partner valter   # one partner
 *   node scripts/verify-sync.mjs --channel shopify  # one channel (shopify|cdon)
 *   node scripts/verify-sync.mjs --json             # machine-readable output
 *
 * Exit code: 0 = everything in sync, 1 = drift found, 2 = execution error.
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir, tmpdir } from 'os';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'valter-crm';
const SHOPIFY_API_VERSION = '2025-01';
const CDON_BASE_URL = 'https://merchants-api.cdon.com/api';
const CDON_THROTTLE_MS = 150;
const SHOPIFY_BATCH_SIZE = 50;
const SHOPIFY_THROTTLE_MS = 300;

const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const partnerFilter = argValue('--partner');
const channelFilter = argValue('--channel'); // shopify | cdon | undefined (both)

function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

// ─── Firestore auth (same workaround as sync-cdon.mjs) ──────────────────────
const FIREBASE_CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi'; // public, embedded in firebase-tools

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
  const tmpPath = join(tmpdir(), 'firebase-verify-sync-adc.json');
  writeFileSync(tmpPath, adcJson, { mode: 0o600 });
  process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpPath;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Shopify ─────────────────────────────────────────────────────────────────

async function shopifyGraphQL(config, query, variables) {
  const res = await fetch(
    `https://${config.storeUrl}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': config.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    }
  );
  if (!res.ok) throw new Error(`Shopify HTTP ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(`Shopify GraphQL: ${json.errors[0].message}`);
  return json.data;
}

const INVENTORY_QUERY = `
  query VerifyStock($ids: [ID!]!, $locationId: ID!) {
    nodes(ids: $ids) {
      ... on InventoryItem {
        id
        inventoryLevel(locationId: $locationId) {
          quantities(names: ["available"]) { name quantity }
        }
      }
    }
  }
`;

/**
 * Fetch Shopify "available" quantities for the given articles.
 * Returns Map<shopifyInventoryItemId, number|null> (null = not found on Shopify).
 */
async function fetchShopifyQuantities(config, articles) {
  const result = new Map();
  // inventoryLevel is per-location; batch per distinct location.
  const byLocation = new Map();
  for (const a of articles) {
    if (!byLocation.has(a.shopifyLocationId)) byLocation.set(a.shopifyLocationId, []);
    byLocation.get(a.shopifyLocationId).push(a.shopifyInventoryItemId);
  }

  for (const [locationId, ids] of byLocation) {
    for (let i = 0; i < ids.length; i += SHOPIFY_BATCH_SIZE) {
      const batch = ids.slice(i, i + SHOPIFY_BATCH_SIZE);
      const data = await shopifyGraphQL(config, INVENTORY_QUERY, {
        ids: batch,
        locationId,
      });
      for (const node of data.nodes ?? []) {
        if (!node?.id) continue;
        const qty = node.inventoryLevel?.quantities?.find((q) => q.name === 'available');
        result.set(node.id, qty ? qty.quantity : null);
      }
      for (const id of batch) if (!result.has(id)) result.set(id, null);
      if (i + SHOPIFY_BATCH_SIZE < ids.length) await sleep(SHOPIFY_THROTTLE_MS);
    }
  }
  return result;
}

// ─── CDON ────────────────────────────────────────────────────────────────────

async function fetchCdonQuantity(config, sku) {
  const auth = Buffer.from(`${config.merchantId}:${config.token}`).toString('base64');
  const res = await fetch(
    `${CDON_BASE_URL}/v1/articles/sku/${encodeURIComponent(sku)}`,
    { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } }
  );
  if (res.status === 404) return null; // not on CDON
  if (!res.ok) throw new Error(`CDON HTTP ${res.status} for SKU ${sku}`);
  const body = await res.json();
  const qty = body?.content?.article?.quantity;
  return typeof qty === 'number' ? qty : null;
}

// ─── Verification ────────────────────────────────────────────────────────────

async function verifyPartner(db, partnerId) {
  const [shopifySnap, cdonSnap] = await Promise.all([
    db.doc(`partners/${partnerId}/integrations/shopify`).get(),
    db.doc(`partners/${partnerId}/integrations/cdon`).get(),
  ]);
  const shopifyConfig = shopifySnap.exists ? shopifySnap.data() : null;
  const cdonConfig = cdonSnap.exists ? cdonSnap.data() : null;

  const checkShopify =
    channelFilter !== 'cdon' && shopifyConfig?.storeUrl && shopifyConfig?.accessToken;
  const checkCdon =
    channelFilter !== 'shopify' && cdonConfig?.merchantId && cdonConfig?.token;

  if (!checkShopify && !checkCdon) return null;

  const productsSnap = await db.collection(`partners/${partnerId}/products`).get();
  const articles = productsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((a) => a.status !== 'archived');

  const shopifyLinked = articles.filter(
    (a) => a.shopifyInventoryItemId && a.shopifyLocationId
  );
  const cdonLinked = articles.filter((a) => a.cdonSku);

  const rows = [];
  const errors = [];

  let shopifyQty = new Map();
  if (checkShopify && shopifyLinked.length) {
    try {
      shopifyQty = await fetchShopifyQuantities(shopifyConfig, shopifyLinked);
    } catch (err) {
      errors.push(`Shopify: ${err.message}`);
    }
  }

  const cdonQty = new Map();
  if (checkCdon && cdonLinked.length) {
    for (const a of cdonLinked) {
      try {
        cdonQty.set(a.cdonSku, await fetchCdonQuantity(cdonConfig, a.cdonSku));
      } catch (err) {
        errors.push(`CDON ${a.cdonSku}: ${err.message}`);
        cdonQty.set(a.cdonSku, undefined); // fetch failed ≠ not listed
      }
      await sleep(CDON_THROTTLE_MS);
    }
  }

  for (const a of articles) {
    const crm = Math.max(0, Math.floor(a.stock ?? 0)); // channels get the clamped value
    const onShopify = checkShopify && a.shopifyInventoryItemId && a.shopifyLocationId;
    const onCdon = checkCdon && a.cdonSku;
    if (!onShopify && !onCdon) continue;

    const shopify = onShopify ? shopifyQty.get(a.shopifyInventoryItemId) : undefined;
    const cdon = onCdon ? cdonQty.get(a.cdonSku) : undefined;

    const drift =
      (onShopify && shopify !== undefined && shopify !== null && shopify !== crm) ||
      (onCdon && cdon !== undefined && cdon !== null && cdon !== crm);
    const missing = (onShopify && shopify === null) || (onCdon && cdon === null);

    rows.push({
      id: a.id,
      title: a.title ?? '',
      sku: a.sku ?? a.cdonSku ?? '',
      crm,
      shopify: onShopify ? shopify : undefined,
      cdon: onCdon ? cdon : undefined,
      status: drift ? 'DRIFT' : missing ? 'MISSING' : 'OK',
    });
  }

  return { partnerId, rows, errors };
}

function printReport(report) {
  const { partnerId, rows, errors } = report;
  console.log(`\n━━━ Partner: ${partnerId} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  if (!rows.length) {
    console.log('  (no channel-linked articles)');
    return;
  }

  const fmt = (v) => (v === undefined ? '—' : v === null ? 'saknas' : String(v));
  const bad = rows.filter((r) => r.status !== 'OK');
  const shown = bad.length ? bad : rows;

  const header = ['STATUS', 'SKU', 'CRM', 'SHOPIFY', 'CDON', 'TITLE'];
  const table = shown.map((r) => [
    r.status === 'OK' ? ' ok ' : r.status,
    r.sku || r.id,
    String(r.crm),
    fmt(r.shopify),
    fmt(r.cdon),
    r.title.slice(0, 40),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...table.map((row) => row[i].length)));
  const line = (cells) => '  ' + cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  console.log(line(header));
  for (const row of table) console.log(line(row));

  const drift = rows.filter((r) => r.status === 'DRIFT').length;
  const missing = rows.filter((r) => r.status === 'MISSING').length;
  const ok = rows.length - drift - missing;
  console.log(`\n  ${rows.length} article(s) checked: ${ok} in sync, ${drift} DRIFT, ${missing} missing on a channel`);
  if (bad.length === 0) console.log('  ✓ CRM, Shopify and CDON agree on every linked article.');
  for (const e of errors) console.log(`  ⚠ ${e}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  setupADCFromFirebaseCLI();
  initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore();

  // Discover partners with any channel integration (no hardcoded partner ids).
  const integrations = await db.collectionGroup('integrations').get();
  const partnerIds = [
    ...new Set(
      integrations.docs
        .filter((d) => d.id === 'shopify' || d.id === 'cdon')
        .map((d) => d.ref.path.split('/')[1])
    ),
  ].filter((id) => !partnerFilter || id === partnerFilter);

  if (!partnerIds.length) {
    console.error(partnerFilter
      ? `No integrations found for partner "${partnerFilter}".`
      : 'No partners with Shopify/CDON integrations found.');
    process.exit(2);
  }

  const reports = [];
  for (const partnerId of partnerIds) {
    const report = await verifyPartner(db, partnerId);
    if (report) reports.push(report);
  }

  if (JSON_OUT) {
    console.log(JSON.stringify(reports, null, 2));
  } else {
    for (const report of reports) printReport(report);
  }

  const hasDrift = reports.some((r) =>
    r.rows.some((row) => row.status !== 'OK')
  );
  const hasErrors = reports.some((r) => r.errors.length > 0);
  process.exit(hasDrift ? 1 : hasErrors ? 2 : 0);
}

main().catch((err) => {
  console.error('verify-sync failed:', err);
  process.exit(2);
});
