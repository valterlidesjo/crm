import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { requireSuperAdmin } from "../lib/require-super-admin.js";

interface UpdateInventoryInput {
  partnerId: string;
  inventoryItemId: string;
  locationId: string;
  newQuantity: number;
}

async function getShopifyConfig(partnerId: string) {
  const db = getFirestore();
  const snap = await db
    .doc(`partners/${partnerId}/integrations/shopify`)
    .get();
  if (!snap.exists) {
    throw new HttpsError(
      "not-found",
      "Shopify integration not configured for this partner"
    );
  }
  return snap.data() as {
    storeUrl: string;
    accessToken: string;
    webhookSecret: string;
  };
}

async function shopifyGraphQL(
  storeUrl: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown>
) {
  const url = `https://${storeUrl}/admin/api/2025-01/graphql.json`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new HttpsError(
      "internal",
      `Shopify API error: ${response.status} ${response.statusText}`
    );
  }

  const json = (await response.json()) as {
    data?: unknown;
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) {
    throw new HttpsError("internal", json.errors[0].message);
  }
  return json.data;
}

const SET_QUANTITIES_MUTATION = `
  mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
      inventoryAdjustmentGroup {
        changes { name delta quantityAfterChange }
      }
      userErrors { code field message }
    }
  }
`;

export const updateShopifyInventory = onCall<UpdateInventoryInput>(
  { region: "europe-west1", invoker: "public" },
  async (request) => {
    await requireSuperAdmin(request, "update Shopify inventory");

    const { partnerId, inventoryItemId, locationId, newQuantity } =
      request.data;

    if (
      !partnerId ||
      !inventoryItemId ||
      !locationId ||
      typeof newQuantity !== "number" ||
      !Number.isFinite(newQuantity) ||
      newQuantity < 0
    ) {
      throw new HttpsError("invalid-argument", "Missing required fields");
    }

    const config = await getShopifyConfig(partnerId);

    const data = (await shopifyGraphQL(
      config.storeUrl,
      config.accessToken,
      SET_QUANTITIES_MUTATION,
      {
        input: {
          name: "available",
          reason: "correction",
          ignoreCompareQuantity: true,
          quantities: [
            {
              inventoryItemId,
              locationId,
              quantity: newQuantity,
            },
          ],
        },
      }
    )) as {
      inventorySetQuantities: {
        userErrors: Array<{ code: string; message: string }>;
      };
    };

    const userErrors = data?.inventorySetQuantities?.userErrors ?? [];
    if (userErrors.length > 0) {
      throw new HttpsError("internal", userErrors[0].message);
    }

    return { success: true, newQuantity };
  }
);
