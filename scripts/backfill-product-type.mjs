#!/usr/bin/env node

/**
 * Backfill `productType` + `googleProductCategory` onto flat article documents
 * for products that aren't (yet) carrying a category from Shopify.
 *
 * Preferred path: set product_type in Shopify, then run a full Shopify resync
 * (syncShopifyProducts) — that fills these fields automatically. This script is
 * the fallback for articles without a Shopify category, and for one-off cleanup.
 *
 * Category is inferred from the article's (group) title using keyword rules:
 *   "rund"               → Speglar > Runda speglar
 *   "rektangul"/"rekt"   → Speglar > Rektangulära speglar
 *   (anything else)      → Speglar  (top-level only; refine manually)
 *
 * "anti-fog"/"imma" is treated as a feature (not a category) and is written to a
 * `tags` array instead, so a mirror can be both rectangular and anti-fog.
 *
 * All mirror categories resolve to googleProductCategory "595"
 * (Home & Garden > Decor > Mirrors).
 *
 * Defaults to --dry-run. Pass --live to write.
 *
 * Usage:
 *   node scripts/backfill-product-type.mjs --partner hemdeal-ab          # dry-run
 *   node scripts/backfill-product-type.mjs --partner hemdeal-ab --live   # write
 *   node scripts/backfill-product-type.mjs --partner hemdeal-ab --overwrite --live
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir, tmpdir } from 'os';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'valter-crm';
const args = process.argv.slice(2);
const LIVE = args.includes('--live');
const OVERWRITE = args.includes('--overwrite'); // re-write even if productType already set
const PARTNER_ID = argValue('--partner') || process.env.PARTNER_ID || 'hemdeal-ab';

const GOOGLE_CATEGORY_MIRRORS = '595'; // Home & Garden > Decor > Mirrors

function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

const FIREBASE_CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

function log(msg)  { console.log(msg); }
function ok(msg)   { console.log(`  ✓ ${msg}`); }
function warn(msg) { console.log(`  ⚠ ${msg}`); }

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
  const tmpPath = join(tmpdir(), 'firebase-product-type-adc.json');
  writeFileSync(tmpPath, adcJson, { mode: 0o600 });
  process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpPath;
}

// Infer product_type from the title. Returns { productType, isAntiFog }.
function inferCategory(article) {
  const text = `${article.groupTitle || ''} ${article.title || ''}`.toLowerCase();
  const isAntiFog = /anti.?fog|imma|uppv(ä|a)rmd/.test(text);

  let productType;
  if (/rund/.test(text)) {
    productType = 'Speglar > Runda speglar';
  } else if (/rektangul|rekt\b/.test(text)) {
    productType = 'Speglar > Rektangulära speglar';
  } else {
    productType = 'Speglar';
  }
  return { productType, isAntiFog };
}

async function main() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(' Backfill productType + googleProductCategory → articles');
  log(` Project : ${PROJECT_ID}`);
  log(` Partner : ${PARTNER_ID}`);
  log(` Mode    : ${LIVE ? 'LIVE (writing)' : 'DRY-RUN (no writes)'}${OVERWRITE ? ' +overwrite' : ''}`);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  setupADCFromFirebaseCLI();
  initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore();

  const col = db.collection(`partners/${PARTNER_ID}/products`);
  const snap = await col.get();
  if (snap.empty) { log('No articles found.'); return; }

  const stats = { total: 0, written: 0, alreadySet: 0, antiFog: 0 };

  for (const docSnap of snap.docs) {
    const a = { id: docSnap.id, ...docSnap.data() };
    stats.total++;

    const hasType = !!a.productType;
    const { productType, isAntiFog } = inferCategory(a);

    if (hasType && !OVERWRITE) {
      ok(`${a.title} → keep existing productType="${a.productType}"`);
      stats.alreadySet++;
      continue;
    }

    const update = {
      productType,
      googleProductCategory: GOOGLE_CATEGORY_MIRRORS,
      updatedAt: new Date().toISOString(),
    };
    if (isAntiFog) {
      const tags = new Set([...(Array.isArray(a.tags) ? a.tags : []), 'anti-fog']);
      update.tags = [...tags];
      stats.antiFog++;
    }

    ok(`${a.title} → set productType="${productType}" gpc=${GOOGLE_CATEGORY_MIRRORS}${isAntiFog ? ' +tag:anti-fog' : ''}`);

    if (LIVE) await col.doc(a.id).update(update);
    stats.written++;
  }

  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(` Articles scanned   : ${stats.total}`);
  log(` ${LIVE ? 'Written' : 'Would write'}          : ${stats.written}`);
  log(` Anti-fog tagged     : ${stats.antiFog}`);
  log(` Already had type    : ${stats.alreadySet} (use --overwrite to replace)`);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (!LIVE) log('\nDRY-RUN — re-run with --live to write.\n');
  else log('\nDone.\n');
}

main().catch((e) => {
  console.error('\nFatal:', e);
  process.exit(1);
});
