import { describe, it, expect } from "vitest";
import { Schema } from "effect";
import { ShopifyOrder } from "./shopify-order";

const validOrder = {
  id: "order_abc",
  shopifyOrderId: "gid://shopify/Order/1234567890",
  orderNumber: "#1042",
  status: "pending" as const,
  lineItems: [
    {
      productTitle: "T-Shirt",
      variantTitle: "M / Blue",
      sku: "TS-M-BLUE",
      quantity: 2,
      price: 199.0,
    },
  ],
  totalPrice: 398.0,
  currency: "SEK",
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
  createdAt: "2026-05-05T10:00:00.000Z",
  updatedAt: "2026-05-05T10:00:00.000Z",
};

describe("ShopifyOrder schema", () => {
  it("accepts a valid pending order", () => {
    const result = Schema.decodeUnknownEither(ShopifyOrder)(validOrder);
    expect(result._tag).toBe("Right");
  });

  it("accepts all valid statuses", () => {
    const statuses = ["pending", "paid", "fulfilled", "cancelled", "refunded"] as const;
    for (const status of statuses) {
      const result = Schema.decodeUnknownEither(ShopifyOrder)({ ...validOrder, status });
      expect(result._tag).toBe("Right");
    }
  });

  it("rejects an invalid status", () => {
    const result = Schema.decodeUnknownEither(ShopifyOrder)({ ...validOrder, status: "shipped" });
    expect(result._tag).toBe("Left");
  });

  it("accepts order without optional sku on line item", () => {
    const { sku: _, ...lineItemNoSku } = validOrder.lineItems[0];
    const result = Schema.decodeUnknownEither(ShopifyOrder)({
      ...validOrder,
      lineItems: [lineItemNoSku],
    });
    expect(result._tag).toBe("Right");
  });

  it("accepts order without optional customer fields", () => {
    const { customerName: _n, customerEmail: _e, ...noCustomer } = validOrder;
    const result = Schema.decodeUnknownEither(ShopifyOrder)(noCustomer);
    expect(result._tag).toBe("Right");
  });

  it("rejects missing required id", () => {
    const { id: _, ...missing } = validOrder;
    const result = Schema.decodeUnknownEither(ShopifyOrder)(missing);
    expect(result._tag).toBe("Left");
  });

  it("accepts an order without shopifyOrderId (e.g. a CDON order)", () => {
    const { shopifyOrderId: _, ...missing } = validOrder;
    const result = Schema.decodeUnknownEither(ShopifyOrder)({
      ...missing,
      source: "cdon",
      cdonOrderId: "cdon_123",
    });
    expect(result._tag).toBe("Right");
  });
});
