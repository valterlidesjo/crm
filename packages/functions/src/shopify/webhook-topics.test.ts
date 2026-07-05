import { describe, it, expect, beforeEach } from "vitest";
import { MockFirestore } from "./firestore-mock";
import {
  handleOrderCreate,
  handleOrderPaid,
  handleOrderCancelled,
  handleOrderFulfilled,
  handleRefundCreate,
  handleProductCreate,
  handleProductDelete,
  handleProductUpdate,
} from "./webhook-topics";

const PARTNER = "valter";

// Each Shopify variant is one CRM article (one document). Seed two articles
// belonging to the same Shopify product (gid .../42), grouped under "T-Shirt".
function seedArticles(db: MockFirestore) {
  db.seed(`partners/${PARTNER}/products`, "art-m", {
    id: "art-m",
    title: "T-Shirt – M",
    groupTitle: "T-Shirt",
    status: "active",
    stock: 10,
    shopifyProductId: "gid://shopify/Product/42",
    shopifyVariantId: "gid://shopify/ProductVariant/111",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  db.seed(`partners/${PARTNER}/products`, "art-l", {
    id: "art-l",
    title: "T-Shirt – L",
    groupTitle: "T-Shirt",
    status: "active",
    stock: 5,
    shopifyProductId: "gid://shopify/Product/42",
    shopifyVariantId: "gid://shopify/ProductVariant/222",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
}

function articleByVariant(db: MockFirestore, variantGid: string) {
  return db
    .docs(`partners/${PARTNER}/products`)
    .find((a) => a.shopifyVariantId === variantGid);
}

function makeOrderPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: 9876543210,
    name: "#1042",
    total_price: "398.00",
    currency: "SEK",
    customer: { first_name: "Jane", last_name: "Doe", email: "jane@example.com" },
    line_items: [
      { product_id: 42, variant_id: 111, quantity: 2, title: "T-Shirt", variant_title: "M", sku: "TS-M", price: "199.00" },
    ],
    ...overrides,
  };
}

// ─── orders/create ───────────────────────────────────────────────────────────

describe("handleOrderCreate", () => {
  it("creates a new ShopifyOrder document with status pending", async () => {
    const db = new MockFirestore();
    await handleOrderCreate(db as never, PARTNER, makeOrderPayload());

    const orders = db.docs(`partners/${PARTNER}/orders`);
    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe("pending");
    expect(orders[0].orderNumber).toBe("#1042");
    expect(orders[0].shopifyOrderId).toBe("gid://shopify/Order/9876543210");
  });

  it("stores customer name and email", async () => {
    const db = new MockFirestore();
    await handleOrderCreate(db as never, PARTNER, makeOrderPayload());

    const [order] = db.docs(`partners/${PARTNER}/orders`);
    expect(order.customerName).toBe("Jane Doe");
    expect(order.customerEmail).toBe("jane@example.com");
  });

  it("stores line items with product title, variant, sku, quantity and price", async () => {
    const db = new MockFirestore();
    await handleOrderCreate(db as never, PARTNER, makeOrderPayload());

    const [order] = db.docs(`partners/${PARTNER}/orders`);
    const items = order.lineItems as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0].productTitle).toBe("T-Shirt");
    expect(items[0].quantity).toBe(2);
    expect(items[0].price).toBe(199.0);
  });

  it("is idempotent — second call updates rather than creating a duplicate", async () => {
    const db = new MockFirestore();
    const payload = makeOrderPayload();
    await handleOrderCreate(db as never, PARTNER, payload);
    await handleOrderCreate(db as never, PARTNER, payload);

    expect(db.docs(`partners/${PARTNER}/orders`)).toHaveLength(1);
  });
});

// ─── orders/paid ─────────────────────────────────────────────────────────────

describe("handleOrderPaid", () => {
  let db: MockFirestore;

  beforeEach(() => {
    db = new MockFirestore();
    seedArticles(db);
  });

  it("decrements stock on the matching article for each line item", async () => {
    await handleOrderPaid(db as never, PARTNER, makeOrderPayload());

    expect(articleByVariant(db, "gid://shopify/ProductVariant/111")?.stock).toBe(8); // 10 - 2
    expect(articleByVariant(db, "gid://shopify/ProductVariant/222")?.stock).toBe(5); // unchanged
  });

  it("does not go below zero stock", async () => {
    db.seed(`partners/${PARTNER}/products`, "art-m", {
      id: "art-m",
      title: "T-Shirt – M",
      status: "active",
      stock: 1,
      shopifyProductId: "gid://shopify/Product/42",
      shopifyVariantId: "gid://shopify/ProductVariant/111",
    });
    await handleOrderPaid(db as never, PARTNER, makeOrderPayload({ line_items: [
      { product_id: 42, variant_id: 111, quantity: 5, title: "T-Shirt", variant_title: "M", sku: "TS-M", price: "199.00" },
    ]}));

    expect(articleByVariant(db, "gid://shopify/ProductVariant/111")?.stock).toBe(0);
  });

  it("upserts an order document with status paid", async () => {
    await handleOrderPaid(db as never, PARTNER, makeOrderPayload());

    const orders = db.docs(`partners/${PARTNER}/orders`);
    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe("paid");
    expect(orders[0].source).toBe("shopify");
    expect(orders[0].stockApplied).toBe(true);
  });

  it("is idempotent — a duplicate orders/paid does not decrement stock twice", async () => {
    const payload = makeOrderPayload();
    await handleOrderPaid(db as never, PARTNER, payload);
    await handleOrderPaid(db as never, PARTNER, payload);

    // 10 - 2 once, NOT 10 - 4
    expect(articleByVariant(db, "gid://shopify/ProductVariant/111")?.stock).toBe(8);
  });
});

// ─── orders/cancelled ────────────────────────────────────────────────────────

describe("handleOrderCancelled", () => {
  let db: MockFirestore;

  beforeEach(() => {
    db = new MockFirestore();
    seedArticles(db);
    // Pre-create the order as paid
    db.seed(`partners/${PARTNER}/orders`, "9876543210", {
      shopifyOrderId: "gid://shopify/Order/9876543210",
      status: "paid",
      orderNumber: "#1042",
    });
  });

  it("updates order status to cancelled", async () => {
    await handleOrderCancelled(db as never, PARTNER, makeOrderPayload());

    const order = db.doc(`partners/${PARTNER}/orders`, "9876543210");
    expect(order?.status).toBe("cancelled");
  });

  it("restores stock on the matching article for each line item", async () => {
    // Starting stock: M = 8 (after a sale of 2)
    db.seed(`partners/${PARTNER}/products`, "art-m", {
      id: "art-m",
      title: "T-Shirt – M",
      status: "active",
      stock: 8,
      shopifyProductId: "gid://shopify/Product/42",
      shopifyVariantId: "gid://shopify/ProductVariant/111",
    });

    await handleOrderCancelled(db as never, PARTNER, makeOrderPayload());

    expect(articleByVariant(db, "gid://shopify/ProductVariant/111")?.stock).toBe(10); // 8 + 2
  });

  it("creates order document if it did not exist yet", async () => {
    const freshDb = new MockFirestore();
    seedArticles(freshDb);

    await handleOrderCancelled(freshDb as never, PARTNER, makeOrderPayload());

    const orders = freshDb.docs(`partners/${PARTNER}/orders`);
    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe("cancelled");
  });
});

// ─── orders/fulfilled ────────────────────────────────────────────────────────

describe("handleOrderFulfilled", () => {
  it("updates order status to fulfilled", async () => {
    const db = new MockFirestore();
    db.seed(`partners/${PARTNER}/orders`, "9876543210", {
      shopifyOrderId: "gid://shopify/Order/9876543210",
      status: "paid",
    });

    await handleOrderFulfilled(db as never, PARTNER, makeOrderPayload());

    const order = db.doc(`partners/${PARTNER}/orders`, "9876543210");
    expect(order?.status).toBe("fulfilled");
  });

  it("creates order document if it did not exist", async () => {
    const db = new MockFirestore();
    await handleOrderFulfilled(db as never, PARTNER, makeOrderPayload());

    const orders = db.docs(`partners/${PARTNER}/orders`);
    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe("fulfilled");
  });
});

// ─── refunds/create ───────────────────────────────────────────────────────────

describe("handleRefundCreate", () => {
  let db: MockFirestore;

  beforeEach(() => {
    db = new MockFirestore();
    db.seed(`partners/${PARTNER}/products`, "art-m", {
      id: "art-m",
      title: "T-Shirt – M",
      status: "active",
      stock: 8,
      shopifyProductId: "gid://shopify/Product/42",
      shopifyVariantId: "gid://shopify/ProductVariant/111",
    });
    db.seed(`partners/${PARTNER}/orders`, "9876543210", {
      shopifyOrderId: "gid://shopify/Order/9876543210",
      status: "paid",
    });
  });

  function makeRefundPayload(restockType: string, quantity = 2, refundId = 555001) {
    return {
      id: refundId,
      order_id: 9876543210,
      refund_line_items: [
        {
          line_item: { variant_id: 111, quantity, title: "T-Shirt", variant_title: "M", sku: "TS-M", price: "199.00" },
          restock_type: restockType,
          quantity,
        },
      ],
    };
  }

  it("updates order status to refunded", async () => {
    await handleRefundCreate(db as never, PARTNER, makeRefundPayload("return"));

    const order = db.doc(`partners/${PARTNER}/orders`, "9876543210");
    expect(order?.status).toBe("refunded");
  });

  it("restores stock when restock_type is return", async () => {
    await handleRefundCreate(db as never, PARTNER, makeRefundPayload("return", 2));

    expect(articleByVariant(db, "gid://shopify/ProductVariant/111")?.stock).toBe(10); // 8 + 2
  });

  it("does NOT restore stock when restock_type is cancel — orders/cancelled owns that restock", async () => {
    // A cancellation-with-restock makes Shopify emit BOTH refunds/create
    // (restock_type "cancel") AND orders/cancelled. Restoring in both handlers
    // double-restocks, so the refund handler must skip "cancel" items.
    await handleRefundCreate(db as never, PARTNER, makeRefundPayload("cancel", 2));

    expect(articleByVariant(db, "gid://shopify/ProductVariant/111")?.stock).toBe(8); // unchanged
  });

  it("does NOT restore stock when restock_type is no_restock", async () => {
    await handleRefundCreate(db as never, PARTNER, makeRefundPayload("no_restock", 2));

    expect(articleByVariant(db, "gid://shopify/ProductVariant/111")?.stock).toBe(8); // unchanged
  });

  it("is idempotent — a duplicate refunds/create delivery does not restock twice", async () => {
    const payload = makeRefundPayload("return", 2);
    await handleRefundCreate(db as never, PARTNER, payload);
    await handleRefundCreate(db as never, PARTNER, payload);

    // 8 + 2 once, NOT 8 + 4
    expect(articleByVariant(db, "gid://shopify/ProductVariant/111")?.stock).toBe(10);
  });

  it("distinct refunds on the same order each restock", async () => {
    await handleRefundCreate(db as never, PARTNER, makeRefundPayload("return", 1, 555001));
    await handleRefundCreate(db as never, PARTNER, makeRefundPayload("return", 1, 555002));

    expect(articleByVariant(db, "gid://shopify/ProductVariant/111")?.stock).toBe(10); // 8 + 1 + 1
  });
});

// ─── cancellation-with-restock end to end ────────────────────────────────────

describe("cancel + refund interplay", () => {
  it("cancellation with restock restores stock exactly ONCE across both webhooks", async () => {
    const db = new MockFirestore();
    seedArticles(db); // art-m stock 10

    const orderPayload = makeOrderPayload(); // 2 × variant 111
    await handleOrderPaid(db as never, PARTNER, orderPayload);
    expect(articleByVariant(db, "gid://shopify/ProductVariant/111")?.stock).toBe(8);

    // Shopify emits both webhooks for a cancel-with-restock, in either order.
    await handleRefundCreate(db as never, PARTNER, {
      id: 777,
      order_id: 9876543210,
      refund_line_items: [
        {
          line_item: { variant_id: 111, quantity: 2, title: "T-Shirt", variant_title: "M", sku: "TS-M", price: "199.00" },
          restock_type: "cancel",
          quantity: 2,
        },
      ],
    });
    await handleOrderCancelled(db as never, PARTNER, orderPayload);

    // Restored once: 8 + 2 = 10, NOT 12.
    expect(articleByVariant(db, "gid://shopify/ProductVariant/111")?.stock).toBe(10);
  });

  it("duplicate orders/cancelled deliveries only restore once", async () => {
    const db = new MockFirestore();
    seedArticles(db);

    const orderPayload = makeOrderPayload();
    await handleOrderPaid(db as never, PARTNER, orderPayload);
    await handleOrderCancelled(db as never, PARTNER, orderPayload);
    await handleOrderCancelled(db as never, PARTNER, orderPayload);

    expect(articleByVariant(db, "gid://shopify/ProductVariant/111")?.stock).toBe(10);
  });
});

// ─── products/create ─────────────────────────────────────────────────────────

describe("handleProductCreate", () => {
  it("creates one article per variant with status active", async () => {
    const db = new MockFirestore();
    await handleProductCreate(db as never, PARTNER, {
      id: 99,
      title: "New Cap",
      body_html: "<p>A great cap</p>",
      vendor: "CapCo",
      variants: [
        { id: 901, title: "One Size", sku: "CAP-OS", price: "249.00", inventory_quantity: 15 },
      ],
    });

    const products = db.docs(`partners/${PARTNER}/products`);
    expect(products).toHaveLength(1);
    // Single variant → title is just the product title (no variant suffix).
    expect(products[0].title).toBe("New Cap");
    expect(products[0].groupTitle).toBe("New Cap");
    expect(products[0].status).toBe("active");
    expect(products[0].shopifyProductId).toBe("gid://shopify/Product/99");
    expect(products[0].stock).toBe(15);
    expect(products[0].sku).toBe("CAP-OS");
  });

  it("strips HTML from body_html for description", async () => {
    const db = new MockFirestore();
    await handleProductCreate(db as never, PARTNER, {
      id: 99,
      title: "New Cap",
      body_html: "<p>A great cap</p>",
      vendor: "CapCo",
      variants: [
        { id: 901, title: "One Size", sku: "CAP-OS", price: "249.00", inventory_quantity: 15 },
      ],
    });

    const [product] = db.docs(`partners/${PARTNER}/products`);
    expect(product.description).toBe("A great cap");
  });

  it("creates a separate article per Shopify variant", async () => {
    const db = new MockFirestore();
    await handleProductCreate(db as never, PARTNER, {
      id: 99,
      title: "Cap",
      body_html: "",
      vendor: "CapCo",
      variants: [
        { id: 901, title: "S", sku: "CAP-S", price: "199.00", inventory_quantity: 3 },
        { id: 902, title: "M", sku: "CAP-M", price: "199.00", inventory_quantity: 7 },
      ],
    });

    const products = db.docs(`partners/${PARTNER}/products`);
    expect(products).toHaveLength(2);

    const s = products.find((p) => p.shopifyVariantId === "gid://shopify/ProductVariant/901");
    expect(s?.title).toBe("Cap – S");
    expect(s?.groupTitle).toBe("Cap");
    expect(s?.stock).toBe(3);
    expect(s?.price).toBe(199.0);
  });

  it("does not create a duplicate when the variant already exists", async () => {
    const db = new MockFirestore();
    db.seed(`partners/${PARTNER}/products`, "shopify-variant-901", {
      id: "shopify-variant-901",
      shopifyProductId: "gid://shopify/Product/99",
      shopifyVariantId: "gid://shopify/ProductVariant/901",
      title: "Old Title",
      status: "active",
      stock: 0,
    });

    await handleProductCreate(db as never, PARTNER, {
      id: 99,
      title: "New Title",
      body_html: "",
      vendor: "",
      variants: [
        { id: 901, title: "Default Title", sku: "CAP", price: "10.00", inventory_quantity: 4 },
      ],
    });

    const products = db.docs(`partners/${PARTNER}/products`);
    expect(products).toHaveLength(1);
    expect(products[0].title).toBe("New Title");
    expect(products[0].stock).toBe(4);
  });
});

// ─── products/delete ─────────────────────────────────────────────────────────

describe("handleProductDelete", () => {
  it("archives every article belonging to the deleted Shopify product", async () => {
    const db = new MockFirestore();
    seedArticles(db);

    await handleProductDelete(db as never, PARTNER, { id: 42 });

    const products = db.docs(`partners/${PARTNER}/products`);
    expect(products).toHaveLength(2);
    expect(products.every((p) => p.status === "archived")).toBe(true);
  });

  it("does nothing if product is not found", async () => {
    const db = new MockFirestore();
    await expect(
      handleProductDelete(db as never, PARTNER, { id: 999 })
    ).resolves.toBeUndefined();
  });
});

// ─── products/update ─────────────────────────────────────────────────────────

describe("handleProductUpdate", () => {
  it("updates group title, description and vendor across the group's articles", async () => {
    const db = new MockFirestore();
    seedArticles(db);

    await handleProductUpdate(db as never, PARTNER, {
      id: 42,
      title: "Tee",
      body_html: "<b>Now even better</b>",
      vendor: "NewBrand",
      variants: [
        { id: 111, title: "M", sku: "TS-M", price: "199.00", inventory_quantity: 9 },
        { id: 222, title: "L", sku: "TS-L", price: "199.00", inventory_quantity: 4 },
      ],
    });

    const m = articleByVariant(db, "gid://shopify/ProductVariant/111");
    expect(m?.title).toBe("Tee – M");
    expect(m?.groupTitle).toBe("Tee");
    expect(m?.description).toBe("Now even better");
    expect(m?.vendor).toBe("NewBrand");
  });

  it("does nothing if product not found", async () => {
    const db = new MockFirestore();
    await expect(
      handleProductUpdate(db as never, PARTNER, { id: 999, title: "Ghost", variants: [] })
    ).resolves.toBeUndefined();
  });

  it("does NOT overwrite CRM stock on existing articles (CRM is source of truth)", async () => {
    const db = new MockFirestore();
    seedArticles(db); // art-m stock 10, art-l stock 5

    await handleProductUpdate(db as never, PARTNER, {
      id: 42,
      title: "Tee",
      variants: [
        { id: 111, title: "M", sku: "TS-M", price: "199.00", inventory_quantity: 0 },
        { id: 222, title: "L", sku: "TS-L", price: "199.00", inventory_quantity: 0 },
      ],
    });

    expect(articleByVariant(db, "gid://shopify/ProductVariant/111")?.stock).toBe(10);
    expect(articleByVariant(db, "gid://shopify/ProductVariant/222")?.stock).toBe(5);
  });
});
