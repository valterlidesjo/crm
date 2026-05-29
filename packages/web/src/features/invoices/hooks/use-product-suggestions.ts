import { useMemo } from "react";
import { useProducts } from "@/features/inventory/hooks/use-products";
import { buildProductSuggestions } from "../utils/build-product-suggestions";

export type { ProductSuggestion } from "../utils/build-product-suggestions";
export { buildProductSuggestions } from "../utils/build-product-suggestions";

import type { ProductSuggestion } from "../utils/build-product-suggestions";

interface ProductSuggestionsResult {
  suggestions: ProductSuggestion[];
  decrementStock: (productId: string, quantity: number) => Promise<number | undefined>;
}

export function useProductSuggestions(): ProductSuggestionsResult {
  const { products, decrementStock } = useProducts();
  const suggestions = useMemo(() => buildProductSuggestions(products), [products]);
  return { suggestions, decrementStock };
}
