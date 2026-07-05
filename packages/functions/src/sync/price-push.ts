import { getFirestore } from "firebase-admin/firestore";
import {
  loadShopifyConfig,
  setShopifyPrice,
} from "../shopify/inventory-client.js";
import { loadCdonConfig, pushCdonPrice } from "../cdon/cdon-client.js";

type DB = ReturnType<typeof getFirestore>;

/** The subset of a flat article document the price push needs. */
export interface ArticlePriceFields {
  price?: number;
  compareAtPrice?: number;
  shopifyProductId?: string;
  shopifyVariantId?: string;
  cdonSku?: string;
}

export interface PricePushResult {
  shopify: "pushed" | "skipped" | "error";
  cdon: "pushed" | "skipped" | "error";
}

/**
 * Fan a CRM article's price out to every linked sales channel. CRM is the
 * source of truth, so this asserts the absolute price (idempotent) rather
 * than applying deltas. Failures on one channel never block the other.
 *
 * No-op when `price` is unset — channels keep their last value.
 */
export async function pushArticlePrice(
  db: DB,
  partnerId: string,
  article: ArticlePriceFields
): Promise<PricePushResult> {
  const result: PricePushResult = { shopify: "skipped", cdon: "skipped" };

  if (article.price === undefined) return result;
  const price = Math.max(0, article.price);

  // ─── Shopify ───
  if (article.shopifyProductId && article.shopifyVariantId) {
    try {
      const config = await loadShopifyConfig(db, partnerId);
      if (config) {
        await setShopifyPrice(
          config,
          article.shopifyProductId,
          article.shopifyVariantId,
          price,
          article.compareAtPrice
        );
        result.shopify = "pushed";
      }
    } catch (err) {
      result.shopify = "error";
      console.error(`[price-push] Shopify push failed (${partnerId}):`, err);
    }
  }

  // ─── CDON ───
  if (article.cdonSku) {
    try {
      const config = await loadCdonConfig(db, partnerId);
      if (config) {
        // cdonRequest never throws on HTTP errors — check the response, or a
        // 401/422 from CDON silently counts as "pushed" and price drifts.
        const res = await pushCdonPrice(
          config,
          article.cdonSku,
          price,
          article.compareAtPrice
        );
        if (!res.ok) {
          throw new Error(
            `CDON ${res.status}: ${JSON.stringify(res.body).slice(0, 300)}`
          );
        }
        result.cdon = "pushed";
      }
    } catch (err) {
      result.cdon = "error";
      console.error(`[price-push] CDON push failed (${partnerId}):`, err);
    }
  }

  return result;
}
