#!/usr/bin/env node

/**
 * Write SKU / GTIN onto flat article documents, sourced from the shared CDON
 * SKU_MAP (scripts/cdon-sku-map.mjs). Matches each article by brand keyword in
 * its (group) title + normalised size derived from the title.
 *
 * Sets on each matched article:
 *   - sku       (the field shown in the inventory UI)
 *   - cdonSku   (same value — the CDON marketplace SKU)
 *   - gtin      (EAN from the map)
 *
 * Also prints each article's current stock, so a dry-run doubles as a stock check.
 *
 * Defaults to --dry-run. Pass --live to write.
 *
 * Usage:
 *   node scripts/sync-skus.mjs --partner hemdeal-ab            # dry-run
 *   node scripts/sync-skus.mjs --partner hemdeal-ab --live     # write
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir, tmpdir } from 'os';
import { lookupSkuGtin } from './cdon-sku-map.mjs';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'valter-crm';
const args = process.argv.slice(2);
const LIVE = args.includes('--live');
const PARTNER_ID = argValue('--partner') || process.env.PARTNER_ID || 'valter';
const OVERWRITE = args.includes('--overwrite'); // re-write even if sku already set

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
  const tmpPath = join(tmpdir(), 'firebase-skus-adc.json');
  writeFileSync(tmpPath, adcJson, { mode: 0o600 });
  process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpPath;
}

// Derive the size from a flat article: the part after the last en dash.
function sizeFromTitle(title) {
  const i = (title || '').lastIndexOf('–');
  return i >= 0 ? title.slice(i + 1).trim() : title;
}

async function main() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(' Sync SKUs from CDON map → articles');
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

  const stats = { matched: 0, written: 0, unmatched: 0, alreadySet: 0 };

  for (const docSnap of snap.docs) {
    const a = { id: docSnap.id, ...docSnap.data() };
    const brandTitle = a.groupTitle || a.title || '';
    const size = sizeFromTitle(a.title);
    const mapping = lookupSkuGtin(brandTitle, size);

    if (!mapping) {
      warn(`${a.title} (stock=${a.stock ?? 0}) → no SKU match for size "${size}"`);
      stats.unmatched++;
      continue;
    }

    stats.matched++;
    const hasSku = !!a.sku;
    const action =
      hasSku && !OVERWRITE
        ? `keep existing sku=${a.sku}`
        : `set sku=${mapping.sku} gtin=${mapping.gtin}`;
    ok(`${a.title} (stock=${a.stock ?? 0}) → ${action}`);

    if (hasSku && !OVERWRITE) {
      stats.alreadySet++;
      continue;
    }

    if (LIVE) {
      await col.doc(a.id).update({
        sku: mapping.sku,
        cdonSku: mapping.sku,
        gtin: mapping.gtin,
        updatedAt: new Date().toISOString(),
      });
    }
    stats.written++;
  }

  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(` Matched in map  : ${stats.matched}`);
  log(` ${LIVE ? 'Written' : 'Would write'}       : ${stats.written}`);
  log(` Already had sku : ${stats.alreadySet} (use --overwrite to replace)`);
  log(` No match        : ${stats.unmatched}`);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (!LIVE) log('\nDRY-RUN — re-run with --live to write.\n');
  else log('\nDone.\n');
}

main().catch((e) => {
  console.error('\nFatal:', e);
  process.exit(1);
});
