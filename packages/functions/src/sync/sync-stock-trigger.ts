import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { pushArticleStock, type ArticleStockFields } from "./stock-push.js";

/**
 * CRM is the single source of truth for stock. Whenever an article's `stock`
 * changes — from a Shopify webhook, the CDON order poll, a private sale, or a
 * manual edit — fan the new quantity out to every linked sales channel.
 *
 * The trigger only reads the article and calls external APIs; it never writes
 * back to the products collection, so it cannot loop on itself.
 */
export const syncStockToChannels = onDocumentWritten(
  {
    document: "partners/{partnerId}/products/{productId}",
    region: "europe-west1",
  },
  async (event) => {
    const after = event.data?.after.data() as ArticleStockFields | undefined;
    if (!after) return; // deleted

    const before = event.data?.before.data() as ArticleStockFields | undefined;

    // Act only on real stock changes (and on first creation).
    const stockChanged = !before || before.stock !== after.stock;
    if (!stockChanged) return;

    // Nothing to push if this article isn't linked to any channel.
    const linked =
      (after.shopifyInventoryItemId && after.shopifyLocationId) || after.cdonSku;
    if (!linked) return;

    const { partnerId, productId } = event.params as {
      partnerId: string;
      productId: string;
    };

    const db = getFirestore();
    const result = await pushArticleStock(db, partnerId, after);
    console.log(
      `[stock-push] ${partnerId}/${productId} stock=${after.stock} → ` +
        `shopify:${result.shopify} cdon:${result.cdon}`
    );
  }
);
