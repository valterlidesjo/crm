import { Schema } from "effect";

export const ShopifyOrderLineItem = Schema.Struct({
  productTitle: Schema.String,
  variantTitle: Schema.optional(Schema.String),
  sku: Schema.optional(Schema.String),
  /** Shopify variant GID — used to match the line to a CRM article. */
  shopifyVariantId: Schema.optional(Schema.String),
  quantity: Schema.Number,
  price: Schema.Number,
});

export type ShopifyOrderLineItem = typeof ShopifyOrderLineItem.Type;

/** Where an order originated. Stored on every order document in `/orders/`. */
export const OrderSource = Schema.Literal("shopify", "cdon");
export type OrderSource = typeof OrderSource.Type;

export const ShopifyOrderStatus = Schema.Literal(
  "pending",
  "paid",
  "fulfilled",
  "cancelled",
  "refunded"
);

export type ShopifyOrderStatus = typeof ShopifyOrderStatus.Type;

export const ShopifyOrder = Schema.Struct({
  id: Schema.String,
  /** Which marketplace this order came from. Defaults to "shopify" for legacy docs. */
  source: Schema.optional(OrderSource),
  shopifyOrderId: Schema.optional(Schema.String),
  /** CDON order id (set when source === "cdon"). */
  cdonOrderId: Schema.optional(Schema.String),
  orderNumber: Schema.String,
  status: ShopifyOrderStatus,
  lineItems: Schema.Array(ShopifyOrderLineItem),
  totalPrice: Schema.Number,
  currency: Schema.String,
  customerName: Schema.optional(Schema.String),
  customerEmail: Schema.optional(Schema.String),
  /** Idempotency guard — true once this order's sale has been applied to stock. */
  stockApplied: Schema.optional(Schema.Boolean),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

export type ShopifyOrder = typeof ShopifyOrder.Type;

/** Generic channel order — same shape, clearer name for non-Shopify sources. */
export const ChannelOrder = ShopifyOrder;
export type ChannelOrder = ShopifyOrder;
