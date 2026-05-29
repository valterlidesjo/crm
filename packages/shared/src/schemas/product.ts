import { Schema } from "effect";

/**
 * A Product is a single sellable article — one SKU, one stock level, one price.
 *
 * Previously a Product embedded a `variants[]` array; that model was flattened
 * so each former variant is now its own Product document. Articles that share a
 * parent product (e.g. different sizes of the same mirror) carry the same
 * `groupTitle` so the UI can still group them visually.
 */
export const Product = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  description: Schema.optional(Schema.String),
  imageUrl: Schema.optional(Schema.String),
  vendor: Schema.optional(Schema.String),
  status: Schema.Literal("active", "archived"),

  // ─── Article (former variant) fields, now top-level ───
  sku: Schema.optional(Schema.String),
  price: Schema.optional(Schema.Number),
  costPrice: Schema.optional(Schema.Number),
  stock: Schema.Number,
  /** Display grouping label — usually the original product title. */
  groupTitle: Schema.optional(Schema.String),

  // ─── Shopify links ───
  shopifyProductId: Schema.optional(Schema.String),
  shopifyHandle: Schema.optional(Schema.String),
  shopifyVariantId: Schema.optional(Schema.String),
  shopifyInventoryItemId: Schema.optional(Schema.String),
  shopifyLocationId: Schema.optional(Schema.String),
  lastShopifySyncAt: Schema.optional(Schema.String),

  // ─── CDON links ───
  /** SKU used on the CDON marketplace (the article SKU). */
  cdonSku: Schema.optional(Schema.String),
  /** CDON article UUID — resolved from `cdonSku`, lets stock pushes skip a lookup. */
  cdonArticleId: Schema.optional(Schema.String),
  /** GTIN/EAN — required by CDON, reused across channels. */
  gtin: Schema.optional(Schema.String),
  lastCdonSyncAt: Schema.optional(Schema.String),

  createdAt: Schema.String,
  updatedAt: Schema.String,
});

export type Product = typeof Product.Type;

export const ShopifyIntegrationConfig = Schema.Struct({
  storeUrl: Schema.String,
  accessToken: Schema.String,
  webhookSecret: Schema.String,
  defaultLocationId: Schema.optional(Schema.String),
  connectedAt: Schema.String,
});

export type ShopifyIntegrationConfig = typeof ShopifyIntegrationConfig.Type;
