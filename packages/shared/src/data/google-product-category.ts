/**
 * Maps a Shopify `product_type` hierarchy string to a Google product taxonomy
 * id (the `google_product_category` feed attribute).
 *
 * The store currently sells mirrors only, so anything under "Speglar" maps to
 * Google category 595 — "Home & Garden > Decor > Mirrors". Extend the table as
 * new top-level product types are introduced.
 */

/** Google taxonomy ids keyed by the first segment of the Shopify product_type. */
export const GOOGLE_CATEGORY_BY_TOP_LEVEL: Record<string, string> = {
  speglar: "595", // Home & Garden > Decor > Mirrors
};

/** Default Google category used when no top-level match is found (mirrors store). */
export const DEFAULT_GOOGLE_PRODUCT_CATEGORY = "595";

/**
 * Derive a Google product category id from a Shopify product_type string.
 * Returns undefined when productType is empty so callers can decide whether to
 * fall back to a default.
 */
export function googleCategoryForProductType(
  productType?: string
): string | undefined {
  if (!productType) return undefined;
  const top = productType.split(">")[0]?.trim().toLowerCase() ?? "";
  return GOOGLE_CATEGORY_BY_TOP_LEVEL[top] ?? DEFAULT_GOOGLE_PRODUCT_CATEGORY;
}
