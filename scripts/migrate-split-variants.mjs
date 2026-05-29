#!/usr/bin/env node

/**
 * Migrate products with embedded variants → one flat article document per variant.
 *
 * Old shape: products/{id} = { title, variants: [{ id, title, sku, price, stock, ... }], ... }
 * New shape: products/{id} = { title, sku, price, stock, groupTitle, shopify*, ... }  (no variants[])
 *
 * Rules:
 *   - Already flat (no `variants` array)      → skipped (idempotent).
 *   - Single variant                          → flattened IN PLACE, same doc id.
 *   - Multiple variants                        → split into `{id}__{variantId}` docs,
 *                                                original document deleted.
 *
 * Defaults to --dry-run (logs the plan, writes nothing). Pass --live to commit.
 *
 * Usage:
 *   node scripts/migrate-split-variants.mjs                      # dry-run, partner=valter
 *   node scripts/migrate-split-variants.mjs --partner hemdeal-ab # dry-run, other partner
 *   node scripts/migrate-split-variants.mjs --live               # commit
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir, tmpdir } from 'os';

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'valter-crm';

const args = process.argv.slice(2);
const LIVE = args.includes('--live');
const PARTNER_ID = argValue('--partner') || process.env.PARTNER_ID || 'valter';

function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

// Firebase CLI OAuth2 client (public, embedded in firebase-tools source)
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
  const tmpPath = join(tmpdir(), 'firebase-migrate-adc.json');
  writeFileSync(tmpPath, adcJson, { mode: 0o600 });
  process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpPath;
}

// Drop undefined values — Firestore rejects them.
function clean(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

// Build a flat article from a product + one of its variants.
function buildArticle(product, variant, { single }) {
  const variantTitle = (variant.title || '').trim();
  const isDefault =
    single || !variantTitle || variantTitle.toLowerCase() === 'default title';
  const title = isDefault ? product.title : `${product.title} – ${variantTitle}`;

  return clean({
    title,
    groupTitle: product.title,
    description: product.description,
    imageUrl: variant.imageUrl || product.imageUrl,
    vendor: product.vendor,
    status: product.status || 'active',

    sku: variant.sku,
    price: variant.price,
    costPrice: variant.costPrice,
    stock: typeof variant.stock === 'number' ? variant.stock : 0,

    shopifyProductId: product.shopifyProductId,
    shopifyHandle: product.shopifyHandle,
    shopifyVariantId: variant.shopifyVariantId,
    shopifyInventoryItemId: variant.shopifyInventoryItemId,
    shopifyLocationId: variant.shopifyLocationId,
    lastShopifySyncAt: product.lastShopifySyncAt,

    createdAt: product.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

async function main() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(' Split variants → flat articles');
  log(` Project : ${PROJECT_ID}`);
  log(` Partner : ${PARTNER_ID}`);
  log(` Mode    : ${LIVE ? 'LIVE (writing)' : 'DRY-RUN (no writes)'}`);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  setupADCFromFirebaseCLI();
  initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore();

  const col = db.collection(`partners/${PARTNER_ID}/products`);
  const snap = await col.get();
  if (snap.empty) { log('No products found.'); return; }

  const stats = { skipped: 0, flattened: 0, split: 0, newDocs: 0, deleted: 0 };

  for (const docSnap of snap.docs) {
    const product = { id: docSnap.id, ...docSnap.data() };

    if (!Array.isArray(product.variants)) {
      stats.skipped++;
      continue; // already flat
    }

    const variants = product.variants;

    if (variants.length <= 1) {
      // Flatten in place (same doc id). Handles 0 or 1 variant.
      const variant = variants[0] ?? {};
      const article = buildArticle(product, variant, { single: true });
      // Remove the legacy variants array.
      const update = { ...article, variants: FieldValue.delete() };

      log(`▸ ${product.title} (${product.id})`);
      ok(`flatten in place → sku=${article.sku ?? '—'} stock=${article.stock}`);
      stats.flattened++;

      if (LIVE) {
        await col.doc(product.id).set(update, { merge: true });
      }
      continue;
    }

    // Multiple variants → split into separate docs, delete original.
    log(`▸ ${product.title} (${product.id}) — ${variants.length} variants`);
    stats.split++;

    for (const variant of variants) {
      const suffix = variant.id || variant.shopifyVariantId || Math.random().toString(36).slice(2);
      const newId = `${product.id}__${String(suffix).replace(/[/]/g, '_')}`;
      const article = buildArticle(product, variant, { single: false });

      ok(`→ ${newId} : "${article.title}" sku=${article.sku ?? '—'} stock=${article.stock}`);
      stats.newDocs++;

      if (LIVE) {
        await col.doc(newId).set(article);
      }
    }

    if (LIVE) {
      await col.doc(product.id).delete();
    }
    stats.deleted++;
    warn(`original ${product.id} ${LIVE ? 'deleted' : 'would be deleted'}`);
  }

  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log(` Already flat (skipped) : ${stats.skipped}`);
  log(` Flattened in place     : ${stats.flattened}`);
  log(` Products split         : ${stats.split} → ${stats.newDocs} new article(s)`);
  log(` Originals deleted      : ${stats.deleted}`);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (!LIVE) log('\nDRY-RUN — re-run with --live to apply.\n');
  else log('\nDone.\n');
}

main().catch((e) => {
  console.error('\nFatal:', e);
  process.exit(1);
});
