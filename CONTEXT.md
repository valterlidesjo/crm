# CRM Domain Context

## Core concepts

**Partner** — a business that uses this CRM. All data is scoped under `/partners/{partnerId}/`. Currently one partner: `valter`.

**Customer** — a B2B prospect or client managed in the CRM pipeline. Not related to Shopify end-consumers.

**Deal** — a sales opportunity tied to a Customer, tracked through pipeline stages.

**Product (Article)** — a single sellable article: one SKU, one stock level, one price. Stored at `/partners/{partnerId}/products/`. CRM is the source of truth for stock. Each article is an independent document — there is no embedded variant array. Articles that share a parent product (e.g. sizes of one mirror) carry the same `groupTitle` for visual grouping, and each links to Shopify via `shopifyProductId` + `shopifyVariantId` (one article per Shopify variant). Shopify link fields: `shopifyProductId`, `shopifyVariantId`, `shopifyInventoryItemId`, `shopifyLocationId`. Categorisation: `productType` mirrors Shopify's `product_type` (raw hierarchy string, e.g. "Speglar > Runda speglar") and is the source of truth for category; `googleProductCategory` holds the Google taxonomy id (e.g. "595" Mirrors) for the Google Shopping feed. Both are synced from Shopify — Shopify is the source of truth for category.

**ShopifyOrder** — an order originating from Shopify, stored in `/partners/{partnerId}/orders/`. Not linked to CRM Customers (Shopify buyers are B2C consumers, CRM customers are B2B). Display fields only: `customerName`, `customerEmail`.

**ShopifyOrder.status** — lifecycle: `pending` → `paid` → `fulfilled` | `cancelled` | `refunded`.

**ShopifyIntegration** — configuration stored at `/partners/{partnerId}/integrations/shopify`. Holds `storeUrl`, `accessToken`, `webhookSecret`.

## Shopify sync rules

- CRM is source of truth for stock. Shopify is updated when CRM stock changes.
- Shopify pushes events to CRM via webhooks. The single webhook endpoint is `handleShopifyWebhook`.
- `inventory_levels/update` is intentionally NOT subscribed — would cause a feedback loop since CRM pushes stock to Shopify.

## Webhook responsibilities

| Topic | CRM action |
|---|---|
| `orders/create` | Create ShopifyOrder with status `pending` |
| `orders/paid` | Upsert ShopifyOrder → `paid`, decrement stock on the article matched by `shopifyVariantId` |
| `orders/cancelled` | Update ShopifyOrder → `cancelled`, restore article stock |
| `orders/fulfilled` | Update ShopifyOrder → `fulfilled` |
| `refunds/create` | Update ShopifyOrder → `refunded`, restore stock for line items where `restock_type` is `return` or `cancel` |
| `products/create` | Upsert one article per Shopify variant |
| `products/update` | Upsert one article per Shopify variant (group title/description/vendor + per-article sku/price/stock) |
| `products/delete` | Archive every article belonging to the Shopify product (`status: "archived"`) |
