import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore } from "firebase-admin/firestore";
import { loadShopifyConfig, shopifyGraphQL, type ShopifyConfig } from "./inventory-client.js";
import { handleOrderPaid, type ShopifyOrderPayload } from "./webhook-topics.js";

type DB = ReturnType<typeof getFirestore>;

const RECENT_ORDERS_QUERY = `
  query RecentPaidOrders($query: String!) {
    orders(first: 100, query: $query, sortKey: UPDATED_AT) {
      edges {
        node {
          id
          name
          displayFinancialStatus
          totalPriceSet { shopMoney { amount currencyCode } }
          customer { firstName lastName email }
          lineItems(first: 100) {
            edges {
              node {
                quantity
                title
                sku
                originalUnitPriceSet { shopMoney { amount } }
                variant { id title }
              }
            }
          }
        }
      }
    }
  }
`;

// Numeric id from a Shopify GID, e.g. gid://shopify/Order/123 → 123.
function numericId(gid: string | undefined): number {
  if (!gid) return 0;
  return Number(gid.split("/").pop());
}

interface GqlOrderNode {
  id: string;
  name: string;
  displayFinancialStatus: string;
  totalPriceSet?: { shopMoney?: { amount?: string; currencyCode?: string } };
  customer?: { firstName?: string; lastName?: string; email?: string };
  lineItems: {
    edges: Array<{
      node: {
        quantity: number;
        title: string;
        sku?: string;
        originalUnitPriceSet?: { shopMoney?: { amount?: string } };
        variant?: { id?: string; title?: string };
      };
    }>;
  };
}

function toOrderPayload(node: GqlOrderNode): ShopifyOrderPayload {
  return {
    id: numericId(node.id),
    name: node.name,
    total_price: node.totalPriceSet?.shopMoney?.amount ?? "0",
    currency: node.totalPriceSet?.shopMoney?.currencyCode ?? "SEK",
    customer: {
      first_name: node.customer?.firstName,
      last_name: node.customer?.lastName,
      email: node.customer?.email,
    },
    line_items: node.lineItems.edges.map(({ node: li }) => ({
      variant_id: numericId(li.variant?.id),
      quantity: li.quantity,
      title: li.title,
      variant_title: li.variant?.title,
      sku: li.sku ?? undefined,
      price: li.originalUnitPriceSet?.shopMoney?.amount ?? "0",
    })),
  };
}

export async function reconcilePartnerOrders(
  db: DB,
  partnerId: string,
  config: ShopifyConfig,
  sinceIso: string
): Promise<number> {
  const data = (await shopifyGraphQL(config, RECENT_ORDERS_QUERY, {
    query: `financial_status:paid updated_at:>=${sinceIso}`,
  })) as { orders?: { edges?: Array<{ node: GqlOrderNode }> } };

  const edges = data.orders?.edges ?? [];
  for (const { node } of edges) {
    // handleOrderPaid is idempotent — it won't decrement stock twice, so this
    // only repairs orders whose webhook was missed.
    await handleOrderPaid(db, partnerId, toOrderPayload(node));
  }
  return edges.length;
}

/**
 * Hourly safety net for Shopify. Live webhooks are the primary path; this pulls
 * recently-paid orders and re-runs the (idempotent) paid handler so a dropped
 * webhook can't leave CRM stock too high. It never reads stock back FROM
 * Shopify — CRM stays the source of truth.
 */
export const reconcileShopifyOrders = onSchedule(
  { schedule: "every 60 minutes", region: "europe-west1" },
  async () => {
    const db = getFirestore();
    const sinceIso = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

    const integrations = await db.collectionGroup("integrations").get();
    for (const doc of integrations.docs) {
      if (doc.id !== "shopify") continue;
      const partnerId = doc.ref.path.split("/")[1];
      const config = await loadShopifyConfig(db, partnerId);
      if (!config) continue;
      try {
        const count = await reconcilePartnerOrders(db, partnerId, config, sinceIso);
        console.log(`[shopify-reconcile] ${partnerId}: checked ${count} paid order(s)`);
      } catch (err) {
        console.error(`[shopify-reconcile] ${partnerId} failed:`, err);
      }
    }
  }
);
