/**
 * Integration tests for the multi-channel stock sync with CRM in the middle.
 *
 * The production chain is:
 *
 *   CDON sale    → pollPartnerCdonOrders → CRM stock decrement ┐
 *   Shopify sale → orders/paid webhook   → CRM stock decrement ┤
 *                                                              ▼
 *                            syncStockToChannels (Firestore trigger)
 *                                                              ▼
 *                    pushArticleStock → Shopify + CDON absolute quantity
 *
 * These tests drive the same modules the trigger uses: the order ingestion
 * handlers mutate a MockFirestore, `shouldPushStock` makes the exact gate
 * decision the trigger makes, and `pushArticleStock` runs against a mocked
 * global fetch so the outgoing Shopify GraphQL / CDON REST payloads are
 * asserted for real.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MockFirestore } from "../shopify/firestore-mock";
import { handleOrderPaid, handleOrderCancelled } from "../shopify/webhook-topics";
import { pollPartnerCdonOrders } from "../cdon/poll-cdon-orders";
import {
  pushArticleStock,
  shouldPushStock,
  type ArticleStockFields,
} from "./stock-push";

const PARTNER = "valter";
const PRODUCTS = `partners/${PARTNER}/products`;
const ORDERS = `partners/${PARTNER}/orders`;

// ─── Fetch mock ───────────────────────────────────────────────────────────────

interface RecordedCall {
  method: string;
  url: string;
  body?: unknown;
}

type RouteHandler = (
  method: string,
  url: string,
  body: unknown
) => { status?: number; body?: unknown } | undefined;

let calls: RecordedCall[] = [];

function installFetchMock(handler: RouteHandler = () => undefined) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: { method?: string; body?: string }) => {
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(init.body) : undefined;
      calls.push({ method, url: String(url), body });
      const res = handler(method, String(url), body) ?? {};
      const status = res.status ?? 200;
      const text = JSON.stringify(res.body ?? {});
      return {
        ok: status >= 200 && status < 300,
        status,
        statusText: String(status),
        text: async () => text,
        json: async () => JSON.parse(text),
      };
    })
  );
}

function callsTo(pattern: string | RegExp): RecordedCall[] {
  return calls.filter((c) =>
    typeof pattern === "string" ? c.url.includes(pattern) : pattern.test(c.url)
  );
}

/** The Shopify inventorySetQuantities quantity of the i:th GraphQL push. */
function shopifyPushedQuantity(call: RecordedCall): number {
  const body = call.body as {
    variables?: { input?: { quantities?: Array<{ quantity: number }> } };
  };
  return body.variables!.input!.quantities![0].quantity;
}

// Default routes: an empty Shopify success + generic CDON 200s.
const SHOPIFY_OK: RouteHandler = (_method, url) => {
  if (url.includes("myshopify.com")) {
    return { body: { data: { inventorySetQuantities: { userErrors: [] } } } };
  }
  return undefined; // CDON: default 200 {} is fine
};

// ─── Seed helpers ─────────────────────────────────────────────────────────────

// One article linked to BOTH channels — the normal Hemdeal case.
const ARTICLE = {
  id: "art-1",
  title: "Spegel Bella 60",
  status: "active",
  sku: "MIR-60",
  cdonSku: "MIR-60",
  cdonArticleId: "cdon-art-9",
  stock: 10,
  shopifyProductId: "gid://shopify/Product/42",
  shopifyVariantId: "gid://shopify/ProductVariant/111",
  shopifyInventoryItemId: "gid://shopify/InventoryItem/333",
  shopifyLocationId: "gid://shopify/Location/1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function seedDb(): MockFirestore {
  const db = new MockFirestore();
  db.seed(PRODUCTS, ARTICLE.id, { ...ARTICLE });
  db.seed(`partners/${PARTNER}/integrations`, "shopify", {
    storeUrl: "hemdeal-test.myshopify.com",
    accessToken: "test-token",
    webhookSecret: "test-secret",
  });
  db.seed(`partners/${PARTNER}/integrations`, "cdon", {
    merchantId: "merchant-1",
    token: "cdon-token",
  });
  return db;
}

function articleData(db: MockFirestore): ArticleStockFields & { stock: number } {
  return db.doc(PRODUCTS, ARTICLE.id) as unknown as ArticleStockFields & {
    stock: number;
  };
}

const CDON_CONFIG = { merchantId: "merchant-1", token: "cdon-token" };

const CDON_ORDER = {
  id: "777",
  order_number: "C-1001",
  rows: [
    {
      sku: "MIR-60",
      quantity: 2,
      article_row_id: "row-1",
      title: "Spegel Bella 60",
      price: 999,
    },
  ],
  total: 1998,
  currency: "SEK",
  customer: { first_name: "Anna", last_name: "Svensson", email: "anna@example.com" },
};

function makeShopifyOrder(quantity: number, orderId = 555000111) {
  return {
    id: orderId,
    name: "#2001",
    total_price: String(999 * quantity),
    currency: "SEK",
    customer: { first_name: "Erik", last_name: "Berg", email: "erik@example.com" },
    line_items: [
      {
        product_id: 42,
        variant_id: 111,
        quantity,
        title: "Spegel Bella 60",
        sku: "MIR-60",
        price: "999.00",
      },
    ],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Direction 1: CDON sale → CRM → Shopify ──────────────────────────────────

describe("CDON sale → CRM → Shopify", () => {
  let db: MockFirestore;

  beforeEach(() => {
    db = seedDb();
    installFetchMock((method, url, body) => {
      if (method === "GET" && url.endsWith("/v1/orders")) {
        return { body: [CDON_ORDER] };
      }
      return SHOPIFY_OK(method, url, body);
    });
  });

  it("polling a new CDON order decrements CRM stock and records the order", async () => {
    const res = await pollPartnerCdonOrders(db as never, PARTNER, CDON_CONFIG);

    expect(res).toEqual({ orders: 1, applied: 1 });
    expect(articleData(db).stock).toBe(8); // 10 - 2

    const order = db.doc(ORDERS, "cdon-777");
    expect(order?.source).toBe("cdon");
    expect(order?.status).toBe("paid");
    expect(order?.stockApplied).toBe(true);

    // Every row acknowledged so CDON stops returning it as new.
    expect(callsTo("/v1/orders/row-1/accept")).toHaveLength(1);
  });

  it("the stock change then fans out the new absolute quantity to Shopify (and CDON)", async () => {
    const before = { ...articleData(db) };
    await pollPartnerCdonOrders(db as never, PARTNER, CDON_CONFIG);
    const after = articleData(db);

    // This is the decision the syncStockToChannels trigger makes.
    expect(shouldPushStock(before, after)).toBe(true);

    calls = [];
    const result = await pushArticleStock(db as never, PARTNER, after);

    expect(result).toEqual({ shopify: "pushed", cdon: "pushed" });

    const shopifyCalls = callsTo("myshopify.com");
    expect(shopifyCalls).toHaveLength(1);
    expect(shopifyPushedQuantity(shopifyCalls[0])).toBe(8);

    // CDON gets the same absolute value re-asserted — harmless echo by design.
    const cdonQuantityCalls = callsTo("/v1/articles/cdon-art-9/quantity");
    expect(cdonQuantityCalls).toHaveLength(1);
    expect(cdonQuantityCalls[0].body).toEqual({ quantity: 8 });
  });

  it("re-polling the same CDON order is idempotent — no double decrement, no push needed", async () => {
    await pollPartnerCdonOrders(db as never, PARTNER, CDON_CONFIG);
    const before = { ...articleData(db) };

    const res = await pollPartnerCdonOrders(db as never, PARTNER, CDON_CONFIG);

    expect(res.applied).toBe(0);
    expect(articleData(db).stock).toBe(8); // still 10 - 2, not 10 - 4
    // Unchanged stock → the trigger would not fire a push.
    expect(shouldPushStock(before, articleData(db))).toBe(false);
  });

  it("a CDON order for an unknown SKU records the order without touching stock", async () => {
    installFetchMock((method, url) => {
      if (method === "GET" && url.endsWith("/v1/orders")) {
        return {
          body: [
            {
              ...CDON_ORDER,
              id: "888",
              rows: [{ sku: "UNKNOWN-SKU", quantity: 3, article_row_id: "row-9" }],
            },
          ],
        };
      }
      return undefined;
    });

    await pollPartnerCdonOrders(db as never, PARTNER, CDON_CONFIG);

    expect(articleData(db).stock).toBe(10); // untouched
    expect(db.doc(ORDERS, "cdon-888")?.stockApplied).toBe(true);
  });
});

// ─── Direction 2: Shopify sale → CRM → CDON ──────────────────────────────────

describe("Shopify sale → CRM → CDON", () => {
  let db: MockFirestore;

  beforeEach(() => {
    db = seedDb();
    installFetchMock(SHOPIFY_OK);
  });

  it("orders/paid decrements CRM stock, then the fan-out pushes the value to CDON (and Shopify)", async () => {
    const before = { ...articleData(db) };
    await handleOrderPaid(db as never, PARTNER, makeShopifyOrder(3));
    const after = articleData(db);

    expect(after.stock).toBe(7); // 10 - 3
    expect(shouldPushStock(before, after)).toBe(true);

    calls = [];
    const result = await pushArticleStock(db as never, PARTNER, after);

    expect(result).toEqual({ shopify: "pushed", cdon: "pushed" });
    expect(callsTo("/v1/articles/cdon-art-9/quantity")[0].body).toEqual({
      quantity: 7,
    });
    // Shopify gets the same absolute value re-asserted (echo converges, no loop).
    expect(shopifyPushedQuantity(callsTo("myshopify.com")[0])).toBe(7);
  });

  it("a duplicate orders/paid delivery does not decrement twice", async () => {
    const payload = makeShopifyOrder(3);
    await handleOrderPaid(db as never, PARTNER, payload);
    await handleOrderPaid(db as never, PARTNER, payload);

    expect(articleData(db).stock).toBe(7);
  });

  it("orders/cancelled restores stock and the restored value fans out", async () => {
    const payload = makeShopifyOrder(3);
    await handleOrderPaid(db as never, PARTNER, payload);
    const before = { ...articleData(db) };

    await handleOrderCancelled(db as never, PARTNER, payload);
    const after = articleData(db);

    expect(after.stock).toBe(10); // back to original
    expect(shouldPushStock(before, after)).toBe(true);

    calls = [];
    await pushArticleStock(db as never, PARTNER, after);
    expect(callsTo("/v1/articles/cdon-art-9/quantity")[0].body).toEqual({
      quantity: 10,
    });
  });

  it("two different orders on the same article both decrement (sequential)", async () => {
    await handleOrderPaid(db as never, PARTNER, makeShopifyOrder(2, 555000111));
    await handleOrderPaid(db as never, PARTNER, makeShopifyOrder(3, 555000222));

    expect(articleData(db).stock).toBe(5); // 10 - 2 - 3
  });
});

// ─── Fan-out behaviour ───────────────────────────────────────────────────────

describe("pushArticleStock fan-out", () => {
  let db: MockFirestore;

  beforeEach(() => {
    db = seedDb();
  });

  it("resolves the CDON article id by SKU when cdonArticleId is missing", async () => {
    installFetchMock((method, url, body) => {
      if (method === "GET" && url.includes("/v1/articles/sku/MIR-60")) {
        return {
          body: { content: { article: { id: "cdon-art-9", sku: "MIR-60", quantity: 5 } } },
        };
      }
      return SHOPIFY_OK(method, url, body);
    });

    const article = { ...articleData(db), cdonArticleId: undefined, stock: 6 };
    const result = await pushArticleStock(db as never, PARTNER, article);

    expect(result.cdon).toBe("pushed");
    expect(callsTo("/v1/articles/cdon-art-9/quantity")[0].body).toEqual({
      quantity: 6,
    });
  });

  it("a CDON HTTP error is reported as error — never silently counted as pushed", async () => {
    installFetchMock((method, url, body) => {
      if (url.includes("/v1/articles/") && url.endsWith("/quantity")) {
        return { status: 500, body: { message: "cdon exploded" } };
      }
      return SHOPIFY_OK(method, url, body);
    });

    const result = await pushArticleStock(db as never, PARTNER, articleData(db));

    expect(result.cdon).toBe("error");
    expect(result.shopify).toBe("pushed"); // channel isolation: one failing never blocks the other
  });

  it("a Shopify error never blocks the CDON push", async () => {
    installFetchMock((_method, url) => {
      if (url.includes("myshopify.com")) {
        return { status: 429, body: {} };
      }
      return undefined;
    });

    const result = await pushArticleStock(db as never, PARTNER, articleData(db));

    expect(result.shopify).toBe("error");
    expect(result.cdon).toBe("pushed");
  });

  it("clamps negative stock to 0 at the channel boundary", async () => {
    installFetchMock(SHOPIFY_OK);

    await pushArticleStock(db as never, PARTNER, { ...articleData(db), stock: -3 });

    expect(callsTo("/v1/articles/cdon-art-9/quantity")[0].body).toEqual({ quantity: 0 });
    expect(shopifyPushedQuantity(callsTo("myshopify.com")[0])).toBe(0);
  });
});

// ─── Trigger gate (shouldPushStock) ──────────────────────────────────────────

describe("shouldPushStock (the syncStockToChannels gate)", () => {
  const linked: ArticleStockFields = {
    stock: 5,
    shopifyInventoryItemId: "gid://shopify/InventoryItem/333",
    shopifyLocationId: "gid://shopify/Location/1",
  };

  it("pushes when stock changed on a linked article", () => {
    expect(shouldPushStock({ ...linked, stock: 6 }, linked)).toBe(true);
  });

  it("pushes on first creation of a linked article", () => {
    expect(shouldPushStock(undefined, linked)).toBe(true);
  });

  it("does NOT push when stock is unchanged (metadata-only edits stay silent)", () => {
    expect(shouldPushStock({ ...linked }, { ...linked })).toBe(false);
  });

  it("does NOT push for an article with no channel links", () => {
    expect(shouldPushStock({ stock: 6 }, { stock: 5 })).toBe(false);
  });

  it("pushes for a CDON-only article", () => {
    expect(shouldPushStock({ stock: 6, cdonSku: "X" }, { stock: 5, cdonSku: "X" })).toBe(true);
  });

  it("does NOT push on deletion", () => {
    expect(shouldPushStock(linked, undefined)).toBe(false);
  });
});
