/**
 * Derive a Google product taxonomy id from a Shopify `product_type` string.
 *
 * Kept local to functions (which don't depend on @crm/shared) but mirrors
 * `googleCategoryForProductType` in packages/shared. The store sells mirrors,
 * so anything under "Speglar" → 595 (Home & Garden > Decor > Mirrors).
 */
const GOOGLE_CATEGORY_BY_TOP_LEVEL: Record<string, string> = {
  speglar: "595",
};

const DEFAULT_GOOGLE_PRODUCT_CATEGORY = "595";

export function googleCategoryForProductType(
  productType?: string | null
): string | undefined {
  if (!productType) return undefined;
  const top = productType.split(">")[0]?.trim().toLowerCase() ?? "";
  return GOOGLE_CATEGORY_BY_TOP_LEVEL[top] ?? DEFAULT_GOOGLE_PRODUCT_CATEGORY;
}
