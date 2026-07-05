import { getFirestore } from "firebase-admin/firestore";
import {
  loadShopifyConfig,
  setShopifyAvailable,
} from "../shopify/inventory-client.js";
import {
  loadCdonConfig,
  getArticleBySku,
  setArticleQuantity,
} from "../cdon/cdon-client.js";

type DB = ReturnType<typeof getFirestore>;

/** The subset of a flat article document the push logic needs. */
export interface ArticleStockFields {
  stock?: number;
  shopifyInventoryItemId?: string;
  shopifyLocationId?: string;
  cdonSku?: string;
  cdonArticleId?: string;
}

export interface PushResult {
  shopify: "pushed" | "skipped" | "error";
  cdon: "pushed" | "skipped" | "error";
}

/**
 * Trigger gate: push only when stock actually changed (or the article was
 * just created) and the article is linked to at least one channel. Pure so
 * the sync-flow tests can drive the exact decision the Firestore trigger makes.
 */
export function shouldPushStock(
  before: ArticleStockFields | undefined,
  after: ArticleStockFields | undefined
): boolean {
  if (!after) return false; // deleted
  const stockChanged = !before || before.stock !== after.stock;
  if (!stockChanged) return false;
  return Boolean(
    (after.shopifyInventoryItemId && after.shopifyLocationId) || after.cdonSku
  );
}

/**
 * Fan a CRM article's stock out to every linked sales channel. CRM is the
 * source of truth, so this asserts the absolute quantity (idempotent) rather
 * than applying deltas. Failures on one channel never block the other.
 */
export async function pushArticleStock(
  db: DB,
  partnerId: string,
  article: ArticleStockFields
): Promise<PushResult> {
  const stock = Math.max(0, Math.floor(article.stock ?? 0));
  const result: PushResult = { shopify: "skipped", cdon: "skipped" };

  // ─── Shopify ───
  if (article.shopifyInventoryItemId && article.shopifyLocationId) {
    try {
      const config = await loadShopifyConfig(db, partnerId);
      if (config) {
        await setShopifyAvailable(
          config,
          article.shopifyInventoryItemId,
          article.shopifyLocationId,
          stock
        );
        result.shopify = "pushed";
      }
    } catch (err) {
      result.shopify = "error";
      console.error(`[stock-push] Shopify push failed (${partnerId}):`, err);
    }
  }

  // ─── CDON ───
  if (article.cdonSku) {
    try {
      const config = await loadCdonConfig(db, partnerId);
      if (config) {
        let articleId = article.cdonArticleId;
        if (!articleId) {
          const cdonArticle = await getArticleBySku(config, article.cdonSku);
          articleId = cdonArticle?.id;
        }
        if (articleId) {
          // cdonRequest never throws on HTTP errors — check the response, or a
          // 401/422 from CDON silently counts as "pushed" and stock drifts.
          const res = await setArticleQuantity(config, articleId, stock);
          if (!res.ok) {
            throw new Error(
              `CDON ${res.status}: ${JSON.stringify(res.body).slice(0, 300)}`
            );
          }
          result.cdon = "pushed";
        }
      }
    } catch (err) {
      result.cdon = "error";
      console.error(`[stock-push] CDON push failed (${partnerId}):`, err);
    }
  }

  return result;
}
