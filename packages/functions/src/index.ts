import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp();
getFirestore().settings({ ignoreUndefinedProperties: true });

export { syncShopifyProducts } from "./shopify/sync-products.js";
export { handleShopifyWebhook } from "./shopify/webhook-handler.js";
export { updateShopifyInventory } from "./shopify/update-inventory.js";
export { registerShopifyWebhooks } from "./shopify/register-webhooks.js";
export { reconcileShopifyOrders } from "./shopify/reconcile-orders.js";

// Central stock fan-out: CRM is the source of truth for stock.
export { syncStockToChannels } from "./sync/sync-stock-trigger.js";

// CDON marketplace (polling-based — CDON has no webhooks).
export { syncCdonProducts } from "./cdon/sync-cdon-products.js";
export { pollCdonOrders, pollCdonOrdersNow } from "./cdon/poll-cdon-orders.js";
