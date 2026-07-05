import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { pushArticlePrice, type ArticlePriceFields } from "./price-push.js";
import { requireSuperAdmin } from "../lib/require-super-admin.js";

interface SyncAllPricesInput {
  partnerId: string;
}

/**
 * Manual "synka alla priser" backup — re-asserts every CRM article's price
 * + compareAtPrice on every linked sales channel. The Firestore trigger
 * handles vardagliga ändringar; this is the one-shot reconciliation when
 * something drifts.
 */
export const syncAllPrices = onCall<SyncAllPricesInput>(
  { region: "europe-west1", timeoutSeconds: 540, invoker: "public" },
  async (request) => {
    await requireSuperAdmin(request, "sync prices");
    const db = getFirestore();

    const { partnerId } = request.data;
    if (!partnerId) {
      throw new HttpsError("invalid-argument", "partnerId is required");
    }

    const snap = await db.collection(`partners/${partnerId}/products`).get();
    const now = new Date().toISOString();
    let total = 0;
    const pushed = { shopify: 0, cdon: 0 };
    const errors: Array<{ productId: string; channel: string }> = [];

    for (const doc of snap.docs) {
      const article = doc.data() as ArticlePriceFields & { status?: string };
      if (article.status && article.status !== "active") continue;
      if (article.price === undefined) continue;
      const linked =
        (article.shopifyProductId && article.shopifyVariantId) ||
        article.cdonSku;
      if (!linked) continue;

      const result = await pushArticlePrice(db, partnerId, article);
      total++;
      if (result.shopify === "pushed") pushed.shopify++;
      if (result.cdon === "pushed") pushed.cdon++;
      if (result.shopify === "error")
        errors.push({ productId: doc.id, channel: "shopify" });
      if (result.cdon === "error")
        errors.push({ productId: doc.id, channel: "cdon" });

      await db
        .collection(
          `partners/${partnerId}/products/${doc.id}/priceHistory`
        )
        .add({
          oldPrice: article.price ?? null,
          newPrice: article.price ?? null,
          oldCompareAtPrice: article.compareAtPrice ?? null,
          newCompareAtPrice: article.compareAtPrice ?? null,
          changedBy: "manual-sync",
          channels: result,
          timestamp: now,
        });
    }

    return { success: true, total, pushed, errors };
  }
);
