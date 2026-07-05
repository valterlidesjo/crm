import { getFirestore } from "firebase-admin/firestore";

type DB = ReturnType<typeof getFirestore>;

/**
 * Thin client for the CDON Merchant API (v1, the actively-maintained version).
 *
 * Base: https://merchants-api.cdon.com/api
 * Auth: HTTP Basic with `merchantId:token`.
 * CDON has NO webhooks, so orders are polled (`GET /v1/orders`) and stock is
 * pushed when CRM stock changes (`PUT /v1/articles/{id}/quantity`).
 *
 * Confirmed live against the API (2026-05):
 *   GET  /v1/articles/sku/{sku}        → { content: { article: { id, sku, quantity, ... } } }
 *   PUT  /v1/articles/{article_id}/quantity   body { quantity }
 *   GET  /v1/orders                    → Order[]  (per-row ops keyed by article_row_id)
 *   PUT  /v1/orders/{article_row_id}/accept
 *   POST /v2/articles/bulk             body { articles }   (full upsert incl. quantity)
 */

const CDON_BASE_URL = "https://merchants-api.cdon.com/api";

export interface CdonConfig {
  merchantId: string;
  token: string;
  market?: string;
}

export interface CdonResponse {
  status: number;
  ok: boolean;
  body: unknown;
}

/** A CDON article as returned by the API (only the fields we rely on). */
export interface CdonArticle {
  id: string;
  sku: string;
  quantity: number;
  status?: string;
  gtin?: string;
}

function authHeader(config: CdonConfig): string {
  return (
    "Basic " +
    Buffer.from(`${config.merchantId}:${config.token}`).toString("base64")
  );
}

export async function cdonRequest(
  config: CdonConfig,
  method: string,
  path: string,
  body?: unknown
): Promise<CdonResponse> {
  const res = await fetch(`${CDON_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: authHeader(config),
      Accept: "application/json",
      ...(body !== undefined && { "Content-Type": "application/json" }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, ok: res.ok, body: parsed };
}

/** Resolve a SKU to its CDON article, or null if CDON doesn't know it yet. */
export async function getArticleBySku(
  config: CdonConfig,
  sku: string
): Promise<CdonArticle | null> {
  const res = await cdonRequest(
    config,
    "GET",
    `/v1/articles/sku/${encodeURIComponent(sku)}`
  );
  if (!res.ok) return null;
  const article = (res.body as { content?: { article?: CdonArticle } })?.content
    ?.article;
  return article ?? null;
}

/** Set the absolute available quantity for a CDON article (idempotent). */
export async function setArticleQuantity(
  config: CdonConfig,
  articleId: string,
  quantity: number
): Promise<CdonResponse> {
  return cdonRequest(config, "PUT", `/v1/articles/${articleId}/quantity`, {
    quantity: Math.max(0, Math.floor(quantity)),
  });
}

/** Fetch all current orders. Per-row fulfilment keys off `article_row_id`. */
export async function listOrders(config: CdonConfig): Promise<unknown[]> {
  const res = await cdonRequest(config, "GET", "/v1/orders");
  if (!res.ok) return [];
  return Array.isArray(res.body) ? res.body : [];
}

/** Acknowledge/accept a single order row so CDON stops returning it as new. */
export async function acceptOrderRow(
  config: CdonConfig,
  articleRowId: string
): Promise<CdonResponse> {
  return cdonRequest(config, "PUT", `/v1/orders/${articleRowId}/accept`);
}

/** Bulk upsert full article payloads (used by the product sync). */
export async function bulkUpsertArticles(
  config: CdonConfig,
  articles: unknown[]
): Promise<CdonResponse> {
  return cdonRequest(config, "POST", "/v2/articles/bulk", { articles });
}

const SE_MARKET = "SE";
const SE_CURRENCY = "SEK";
const SE_VAT_RATE = 0.25;

/**
 * Push price for a single CDON article. CDON has no targeted "set price"
 * endpoint, so we use the bulk upsert with a minimal payload keyed by SKU.
 * Upserts on `/v2/articles/bulk` merge per field — other attributes
 * (category, manufacturer, gtin, …) set by the initial create stay intact.
 *
 * compareAtPrice maps to `recommended_retail_price` (the strikethrough/
 * pre-discount price on CDON). When unset, the field is omitted — CDON keeps
 * the previous value rather than clearing it; full re-syncs via the bulk
 * script remain the way to fully reset article state.
 */
export async function pushCdonPrice(
  config: CdonConfig,
  sku: string,
  price: number,
  compareAtPrice: number | undefined
): Promise<CdonResponse> {
  const market = config.market ?? SE_MARKET;
  const article: Record<string, unknown> = {
    sku,
    price: [
      {
        market,
        value: {
          amount_including_vat: price,
          currency: SE_CURRENCY,
          vat_rate: SE_VAT_RATE,
        },
      },
    ],
  };
  if (compareAtPrice !== undefined && compareAtPrice > price) {
    article.recommended_retail_price = [
      {
        market,
        value: {
          amount_including_vat: compareAtPrice,
          currency: SE_CURRENCY,
          vat_rate: SE_VAT_RATE,
        },
      },
    ];
  }
  return bulkUpsertArticles(config, [article]);
}

/** Load a partner's CDON credentials, or null if not configured. */
export async function loadCdonConfig(
  db: DB,
  partnerId: string
): Promise<CdonConfig | null> {
  const snap = await db.doc(`partners/${partnerId}/integrations/cdon`).get();
  if (!snap.exists) return null;
  const data = snap.data() as Partial<CdonConfig>;
  if (!data.merchantId || !data.token) return null;
  return { merchantId: data.merchantId, token: data.token, market: data.market };
}

/** All partner IDs that have a CDON integration configured. */
export async function partnersWithCdon(db: DB): Promise<string[]> {
  const snap = await db.collectionGroup("integrations").get();
  const ids: string[] = [];
  for (const doc of snap.docs) {
    if (doc.id !== "cdon") continue;
    const data = doc.data() as Partial<CdonConfig>;
    if (!data.merchantId || !data.token) continue;
    // path: partners/{partnerId}/integrations/cdon
    ids.push(doc.ref.path.split("/")[1]);
  }
  return ids;
}
