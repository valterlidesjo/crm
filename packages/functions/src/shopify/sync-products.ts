import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { googleCategoryForProductType } from "./category";
import { requireSuperAdmin } from "../lib/require-super-admin.js";

interface SyncShopifyProductsInput {
  partnerId: string;
  forceStockOverwrite?: boolean;
  /**
   * When true, re-pulls price + compareAtPrice from Shopify on existing
   * articles. Off by default — CRM owns price, so an accidental re-sync
   * shouldn't clobber CRM-set prices.
   */
  forcePriceOverwrite?: boolean;
}

interface ShopifyVariantNode {
  id: string;
  title: string;
  sku: string | null;
  price: string;
  compareAtPrice: string | null;
  inventoryItem: {
    id: string;
    inventoryLevels: {
      edges: Array<{
        node: {
          location: { id: string };
          quantities: Array<{ name: string; quantity: number }>;
        };
      }>;
    };
  };
}

interface ShopifyProductNode {
  id: string;
  title: string;
  descriptionHtml: string;
  handle: string;
  vendor: string;
  productType: string;
  images: { edges: Array<{ node: { url: string } }> };
  variants: { edges: Array<{ node: ShopifyVariantNode }> };
}

interface ShopifyProductsResponse {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: Array<{ node: ShopifyProductNode }>;
  };
}

const PRODUCTS_QUERY = `
  query GetProducts($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id title descriptionHtml handle vendor productType
          images(first: 1) { edges { node { url } } }
          variants(first: 100) {
            edges {
              node {
                id title sku price compareAtPrice
                inventoryItem {
                  id
                  inventoryLevels(first: 1) {
                    edges {
                      node {
                        location { id }
                        quantities(names: ["available"]) { name quantity }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

async function shopifyGraphQL(
  storeUrl: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<unknown> {
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

async function copyImageToStorage(
  imageUrl: string,
  storagePath: string
): Promise<string | null> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "image/jpeg";

    const bucket = getStorage().bucket();
    const file = bucket.file(storagePath);

    await file.save(buffer, {
      metadata: { contentType },
    });

    await file.makePublic();
    return `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
  } catch (err) {
    console.warn(`Failed to copy image from ${imageUrl}:`, err);
    return null;
  }
}

export const syncShopifyProducts = onCall<SyncShopifyProductsInput>(
  { region: "europe-west1", timeoutSeconds: 300, memory: "512MiB", invoker: "public" },
  async (request) => {
    await requireSuperAdmin(request, "sync Shopify products");

    const db = getFirestore();

    const { partnerId, forceStockOverwrite, forcePriceOverwrite } = request.data;
    if (!partnerId) {
      throw new HttpsError("invalid-argument", "partnerId is required");
    }

    // Load Shopify config
    const configSnap = await db
      .doc(`partners/${partnerId}/integrations/shopify`)
      .get();

    if (!configSnap.exists) {
      throw new HttpsError(
        "not-found",
        "Shopify integration not configured for this partner"
      );
    }

    const config = configSnap.data() as {
      storeUrl: string;
      accessToken: string;
    };

    // Fetch all products with pagination
    const allProducts: ShopifyProductNode[] = [];
    let cursor: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const data = (await shopifyGraphQL(
        config.storeUrl,
        config.accessToken,
        PRODUCTS_QUERY,
        cursor ? { cursor } : {}
      )) as ShopifyProductsResponse;

      const { products } = data;
      allProducts.push(...products.edges.map((e) => e.node));
      hasNextPage = products.pageInfo.hasNextPage;
      cursor = products.pageInfo.endCursor;
    }

    const now = new Date().toISOString();
    const productsCol = db.collection(`partners/${partnerId}/products`);

    // Each Shopify variant maps to one CRM article (one document).
    // Map existing articles by shopifyVariantId so re-syncs update in place
    // and preserve CRM stock unless forceStockOverwrite is set.
    const existingSnap = await productsCol
      .where("shopifyVariantId", "!=", null)
      .get();

    const existingByVariantId = new Map<
      string,
      { docId: string; stock: number }
    >();
    for (const doc of existingSnap.docs) {
      const data = doc.data();
      const variantId = data.shopifyVariantId as string | undefined;
      if (variantId)
        existingByVariantId.set(variantId, {
          docId: doc.id,
          stock: (data.stock as number) ?? 0,
        });
    }

    let synced = 0;
    let created = 0;

    for (const shopifyProduct of allProducts) {
      // Copy the product image once and share its URL across all variant
      // articles. Keyed on the Shopify product id so it isn't recopied per
      // variant or per sync.
      const rawImageUrl = shopifyProduct.images.edges[0]?.node.url ?? null;
      const groupStorageId = shopifyProduct.id.replace(/\//g, "_");
      let imageUrl: string | undefined;
      if (rawImageUrl) {
        const storagePath = `partners/${partnerId}/products/${groupStorageId}/cover`;
        const copied = await copyImageToStorage(rawImageUrl, storagePath);
        if (copied) imageUrl = copied;
      }

      // Strip HTML from description
      const description = shopifyProduct.descriptionHtml
        .replace(/<[^>]+>/g, "")
        .trim();

      const productType = shopifyProduct.productType?.trim() || undefined;
      const googleProductCategory = googleCategoryForProductType(productType);

      const variantNodes = shopifyProduct.variants.edges.map((e) => e.node);
      const isSingle = variantNodes.length === 1;

      for (const v of variantNodes) {
        const inventoryLevel = v.inventoryItem.inventoryLevels.edges[0]?.node;
        const availableQty =
          inventoryLevel?.quantities.find((q) => q.name === "available")
            ?.quantity ?? 0;

        const isDefault =
          isSingle || v.title.toLowerCase() === "default title";
        const title = isDefault
          ? shopifyProduct.title
          : `${shopifyProduct.title} – ${v.title}`;

        const existing = existingByVariantId.get(v.id);

        const priceFields = {
          ...(parseFloat(v.price) && { price: parseFloat(v.price) }),
          ...(v.compareAtPrice &&
            parseFloat(v.compareAtPrice) > 0 && {
              compareAtPrice: parseFloat(v.compareAtPrice),
            }),
        };

        const baseFields = {
          title,
          groupTitle: shopifyProduct.title,
          ...(description && { description }),
          ...(shopifyProduct.vendor && { vendor: shopifyProduct.vendor }),
          ...(productType && { productType }),
          ...(googleProductCategory && { googleProductCategory }),
          ...(imageUrl && { imageUrl }),
          ...(v.sku && { sku: v.sku }),
          shopifyProductId: shopifyProduct.id,
          shopifyHandle: shopifyProduct.handle,
          shopifyVariantId: v.id,
          shopifyInventoryItemId: v.inventoryItem.id,
          ...(inventoryLevel?.location.id && {
            shopifyLocationId: inventoryLevel.location.id,
          }),
          lastShopifySyncAt: now,
          updatedAt: now,
        };

        if (existing) {
          await productsCol.doc(existing.docId).update({
            ...baseFields,
            ...(forcePriceOverwrite ? priceFields : {}),
            stock: forceStockOverwrite ? availableQty : existing.stock,
          });
          synced++;
        } else {
          // Deterministic id from the Shopify variant id so re-syncs are stable.
          const docId = `shopify-variant-${v.id.split("/").pop()}`;
          await productsCol.doc(docId).set({
            id: docId,
            ...baseFields,
            ...priceFields,
            stock: availableQty,
            status: "active",
            createdAt: now,
          });
          created++;
        }
      }
    }

    return {
      success: true,
      totalProducts: allProducts.length,
      created,
      synced,
    };
  }
);
