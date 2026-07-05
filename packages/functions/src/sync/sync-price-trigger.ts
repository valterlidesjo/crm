import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { pushArticlePrice, type ArticlePriceFields } from "./price-push.js";

/**
 * CRM is the single source of truth for price. Whenever an article's `price`
 * or `compareAtPrice` changes, fan the new values out to every linked sales
 * channel (Shopify + CDON).
 *
 * The trigger only reads the article, calls external APIs, and writes an
 * audit entry under `priceHistory/` — it never writes back to the article
 * doc, so it cannot loop on itself.
 */
export const syncPriceToChannels = onDocumentWritten(
  {
    document: "partners/{partnerId}/products/{productId}",
    region: "europe-west1",
  },
  async (event) => {
    const after = event.data?.after.data() as ArticlePriceFields | undefined;
    if (!after) return;

    const before = event.data?.before.data() as ArticlePriceFields | undefined;

    const priceChanged = !before || before.price !== after.price;
    const compareChanged =
      !before || before.compareAtPrice !== after.compareAtPrice;
    if (!priceChanged && !compareChanged) return;

    const linked =
      (after.shopifyProductId && after.shopifyVariantId) || after.cdonSku;
    if (!linked) return;

    const { partnerId, productId } = event.params as {
      partnerId: string;
      productId: string;
    };

    const db = getFirestore();
    const result = await pushArticlePrice(db, partnerId, after);

    await db
      .collection(
        `partners/${partnerId}/products/${productId}/priceHistory`
      )
      .add({
        oldPrice: before?.price ?? null,
        newPrice: after.price ?? null,
        oldCompareAtPrice: before?.compareAtPrice ?? null,
        newCompareAtPrice: after.compareAtPrice ?? null,
        changedBy: "crm",
        channels: result,
        timestamp: new Date().toISOString(),
      });

    console.log(
      `[price-push] ${partnerId}/${productId} price=${after.price} ` +
        `compareAt=${after.compareAtPrice} → ` +
        `shopify:${result.shopify} cdon:${result.cdon}`
    );
  }
);
