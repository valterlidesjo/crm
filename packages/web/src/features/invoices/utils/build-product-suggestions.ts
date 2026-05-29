import type { Product } from "@crm/shared";

export interface ProductSuggestion {
  description: string;
  sku?: string;
  unitPrice: number;
  productId: string;
}

export function buildProductSuggestions(products: Product[]): ProductSuggestion[] {
  const suggestions: ProductSuggestion[] = [];
  for (const product of products) {
    if (product.status === "archived") continue;
    suggestions.push({
      description: product.title,
      sku: product.sku,
      unitPrice: product.price ?? 0,
      productId: product.id,
    });
  }
  return suggestions;
}
