import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import {
  loadCdonConfig,
  getArticleBySku,
  setArticleQuantity,
} from "./cdon-client.js";
import { requireSuperAdmin } from "../lib/require-super-admin.js";

interface SyncCdonProductsInput {
  partnerId: string;
}

/**
 * Link CRM articles to their CDON counterparts and assert current stock.
 *
 * For every active CRM article that carries a CDON SKU (explicit `cdonSku`, or
 * falling back to `sku`), this resolves the CDON article, stores its UUID +
 * GTIN back on the CRM doc (so the central stock trigger can push without an
 * extra lookup), and pushes the current CRM stock to CDON.
 *
 * Initial article *creation* on CDON (full payload with category, manufacturer,
 * etc.) is handled by `scripts/sync-cdon.mjs`; this keeps the link + stock in
 * sync from then on.
 */
export const syncCdonProducts = onCall<SyncCdonProductsInput>(
  { region: "europe-west1", timeoutSeconds: 300, invoker: "public" },
  async (request) => {
    await requireSuperAdmin(request, "sync CDON");
    const db = getFirestore();

    const { partnerId } = request.data;
    if (!partnerId) {
      throw new HttpsError("invalid-argument", "partnerId is required");
    }

    const config = await loadCdonConfig(db, partnerId);
    if (!config) {
      throw new HttpsError("not-found", "CDON integration not configured");
    }

    const snap = await db.collection(`partners/${partnerId}/products`).get();
    const now = new Date().toISOString();
    let linked = 0;
    let pushed = 0;
    let missing = 0;

    for (const doc of snap.docs) {
      const p = doc.data() as {
        status?: string;
        sku?: string;
        cdonSku?: string;
        stock?: number;
      };
      if (p.status !== "active") continue;
      const sku = p.cdonSku ?? p.sku;
      if (!sku) continue;

      const article = await getArticleBySku(config, sku);
      if (!article) {
        missing++;
        continue;
      }

      await setArticleQuantity(config, article.id, p.stock ?? 0);
      pushed++;
      linked++;
      await doc.ref.update({
        cdonSku: sku,
        cdonArticleId: article.id,
        ...(article.gtin && { gtin: article.gtin }),
        lastCdonSyncAt: now,
      });
    }

    return { success: true, linked, pushed, missing };
  }
);
