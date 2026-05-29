import { describe, it, expect } from "vitest";
import { buildProductSuggestions } from "../utils/build-product-suggestions";
import type { Product } from "@crm/shared";

function makeArticle(overrides: Partial<Product> & { id: string; title: string }): Product {
  return {
    status: "active",
    stock: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildProductSuggestions", () => {
  it("returns empty array for empty products list", () => {
    expect(buildProductSuggestions([])).toEqual([]);
  });

  it("skips archived articles", () => {
    const products: Product[] = [
      makeArticle({ id: "p1", title: "Active", status: "active" }),
      makeArticle({ id: "p2", title: "Archived", status: "archived" }),
    ];
    const result = buildProductSuggestions(products);
    expect(result).toHaveLength(1);
    expect(result[0].productId).toBe("p1");
  });

  it("uses the article title as the description", () => {
    const products: Product[] = [
      makeArticle({ id: "p1", title: "Laptop", price: 2000 }),
    ];
    const result = buildProductSuggestions(products);
    expect(result[0].description).toBe("Laptop");
  });

  it("preserves productId in each suggestion", () => {
    const products: Product[] = [
      makeArticle({ id: "prod-123", title: "Thing" }),
    ];
    const result = buildProductSuggestions(products);
    expect(result[0].productId).toBe("prod-123");
  });

  it("includes sku when present", () => {
    const products: Product[] = [
      makeArticle({ id: "p1", title: "Item", sku: "SKU-001" }),
    ];
    const result = buildProductSuggestions(products);
    expect(result[0].sku).toBe("SKU-001");
  });

  it("leaves sku undefined when not set", () => {
    const products: Product[] = [makeArticle({ id: "p1", title: "Item" })];
    const result = buildProductSuggestions(products);
    expect(result[0].sku).toBeUndefined();
  });

  it("defaults unitPrice to 0 when the article has no price", () => {
    const products: Product[] = [makeArticle({ id: "p1", title: "Item" })];
    const result = buildProductSuggestions(products);
    expect(result[0].unitPrice).toBe(0);
  });

  it("uses the article price when set", () => {
    const products: Product[] = [
      makeArticle({ id: "p1", title: "Item", price: 499.99 }),
    ];
    const result = buildProductSuggestions(products);
    expect(result[0].unitPrice).toBe(499.99);
  });

  it("produces one suggestion per active article", () => {
    const products: Product[] = [
      makeArticle({ id: "p1", title: "A" }),
      makeArticle({ id: "p2", title: "B – S" }),
      makeArticle({ id: "p3", title: "B – M" }),
    ];
    const result = buildProductSuggestions(products);
    expect(result).toHaveLength(3);
  });
});
