import { getFirestore } from "firebase-admin/firestore";

type DB = ReturnType<typeof getFirestore>;

export interface ShopifyConfig {
  storeUrl: string;
  accessToken: string;
  webhookSecret?: string;
}

const API_VERSION = "2025-01";

export async function shopifyGraphQL(
  config: ShopifyConfig,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<unknown> {
  const url = `https://${config.storeUrl}/admin/api/${API_VERSION}/graphql.json`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": config.accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    throw new Error(
      `Shopify API error: ${response.status} ${response.statusText}`
    );
  }
  const json = (await response.json()) as {
    data?: unknown;
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

const SET_QUANTITIES_MUTATION = `
  mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
      inventoryAdjustmentGroup { changes { name delta quantityAfterChange } }
      userErrors { code field message }
    }
  }
`;

/**
 * Set the absolute "available" quantity for a Shopify inventory item at a
 * location. Idempotent — re-asserting the current value is a no-op.
 */
export async function setShopifyAvailable(
  config: ShopifyConfig,
  inventoryItemId: string,
  locationId: string,
  quantity: number
): Promise<void> {
  const data = (await shopifyGraphQL(config, SET_QUANTITIES_MUTATION, {
    input: {
      name: "available",
      reason: "correction",
      ignoreCompareQuantity: true,
      quantities: [
        { inventoryItemId, locationId, quantity: Math.max(0, Math.floor(quantity)) },
      ],
    },
  })) as {
    inventorySetQuantities?: { userErrors?: Array<{ message: string }> };
  };
  const userErrors = data?.inventorySetQuantities?.userErrors ?? [];
  if (userErrors.length > 0) throw new Error(userErrors[0].message);
}

/** Load a partner's Shopify credentials, or null if not configured. */
export async function loadShopifyConfig(
  db: DB,
  partnerId: string
): Promise<ShopifyConfig | null> {
  const snap = await db.doc(`partners/${partnerId}/integrations/shopify`).get();
  if (!snap.exists) return null;
  const data = snap.data() as Partial<ShopifyConfig>;
  if (!data.storeUrl || !data.accessToken) return null;
  return {
    storeUrl: data.storeUrl,
    accessToken: data.accessToken,
    webhookSecret: data.webhookSecret,
  };
}
