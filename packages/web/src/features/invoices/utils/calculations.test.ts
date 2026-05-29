import { describe, it, expect } from "vitest";
import {
  calcLineTotal,
  calcLineVat,
  calcInvoiceTotals,
  formatVatNumber,
  type InvoiceLineData,
} from "./calculations";

describe("calcLineTotal", () => {
  it("multiplies quantity by unit price", () => {
    expect(calcLineTotal(5, 200)).toBe(1000);
  });

  it("returns 0 when quantity is 0", () => {
    expect(calcLineTotal(0, 500)).toBe(0);
  });

  it("handles decimal prices", () => {
    expect(calcLineTotal(3, 99.5)).toBeCloseTo(298.5);
  });
});

describe("calcLineVat", () => {
  it("calculates 25% VAT", () => {
    expect(calcLineVat(2, 100, "25")).toBe(50);
  });

  it("calculates 12% VAT", () => {
    expect(calcLineVat(1, 1000, "12")).toBe(120);
  });

  it("calculates 6% VAT", () => {
    expect(calcLineVat(1, 1000, "6")).toBe(60);
  });

  it("calculates 0% VAT", () => {
    expect(calcLineVat(10, 500, "0")).toBe(0);
  });
});

describe("calcInvoiceTotals", () => {
  it("calculates totals for single item", () => {
    const items: InvoiceLineData[] = [
      { description: "Service", quantity: 10, unitPrice: 1000, vatRate: "25" },
    ];
    const result = calcInvoiceTotals(items);
    expect(result.subtotal).toBe(10000);
    expect(result.vatAmount).toBe(2500);
    expect(result.total).toBe(12500);
    expect(result.vatBreakdown).toHaveLength(1);
    expect(result.vatBreakdown[0].rate).toBe("25");
  });

  it("calculates totals with mixed VAT rates", () => {
    const items: InvoiceLineData[] = [
      { description: "Consulting", quantity: 5, unitPrice: 2000, vatRate: "25" },
      { description: "Books", quantity: 3, unitPrice: 300, vatRate: "6" },
    ];
    const result = calcInvoiceTotals(items);
    expect(result.subtotal).toBe(10900);
    expect(result.vatBreakdown).toHaveLength(2);

    const vat25 = result.vatBreakdown.find((e) => e.rate === "25");
    const vat6 = result.vatBreakdown.find((e) => e.rate === "6");
    expect(vat25?.amount).toBe(2500);
    expect(vat6?.amount).toBe(54);
    expect(result.total).toBe(13454);
  });

  it("handles empty items array", () => {
    const result = calcInvoiceTotals([]);
    expect(result.subtotal).toBe(0);
    expect(result.vatAmount).toBe(0);
    expect(result.total).toBe(0);
    expect(result.vatBreakdown).toHaveLength(0);
  });

  it("sorts VAT breakdown by rate descending", () => {
    const items: InvoiceLineData[] = [
      { description: "A", quantity: 1, unitPrice: 100, vatRate: "6" },
      { description: "B", quantity: 1, unitPrice: 100, vatRate: "25" },
      { description: "C", quantity: 1, unitPrice: 100, vatRate: "12" },
    ];
    const result = calcInvoiceTotals(items);
    expect(result.vatBreakdown[0].rate).toBe("25");
    expect(result.vatBreakdown[1].rate).toBe("12");
    expect(result.vatBreakdown[2].rate).toBe("6");
  });

  it("groups items with the same VAT rate", () => {
    const items: InvoiceLineData[] = [
      { description: "A", quantity: 2, unitPrice: 500, vatRate: "25" },
      { description: "B", quantity: 3, unitPrice: 200, vatRate: "25" },
    ];
    const result = calcInvoiceTotals(items);
    expect(result.subtotal).toBe(1600);
    expect(result.vatBreakdown).toHaveLength(1);
    expect(result.vatBreakdown[0].amount).toBe(400);
    expect(result.total).toBe(2000);
  });
});

describe("InvoiceLineData optional inventory fields", () => {
  it("calculates correctly when productId is present", () => {
    const items: InvoiceLineData[] = [
      { description: "Laptop", quantity: 1, unitPrice: 1000, vatRate: "25", productId: "prod-123" },
    ];
    const result = calcInvoiceTotals(items);
    expect(result.subtotal).toBe(1000);
    expect(result.total).toBe(1250);
  });

  it("calculates correctly when variantId is present", () => {
    const items: InvoiceLineData[] = [
      { description: "Shirt L", quantity: 5, unitPrice: 100, vatRate: "25", variantId: "var-456" },
    ];
    const result = calcInvoiceTotals(items);
    expect(result.subtotal).toBe(500);
    expect(result.total).toBe(625);
  });

  it("calculates correctly when sku is present", () => {
    const items: InvoiceLineData[] = [
      { description: "Widget", quantity: 10, unitPrice: 50, vatRate: "12", sku: "SKU-789" },
    ];
    const result = calcInvoiceTotals(items);
    expect(result.subtotal).toBe(500);
    expect(result.vatAmount).toBeCloseTo(60);
  });

  it("produces identical totals for inventory vs custom items with same price/qty/vat", () => {
    const inventoryItem: InvoiceLineData = {
      description: "Product from inventory",
      quantity: 2,
      unitPrice: 500,
      vatRate: "25",
      productId: "p1",
      variantId: "v1",
      sku: "P1-SKU",
    };
    const customItem: InvoiceLineData = {
      description: "Custom line item",
      quantity: 2,
      unitPrice: 500,
      vatRate: "25",
    };
    const r1 = calcInvoiceTotals([inventoryItem]);
    const r2 = calcInvoiceTotals([customItem]);
    expect(r1.subtotal).toBe(r2.subtotal);
    expect(r1.vatAmount).toBe(r2.vatAmount);
    expect(r1.total).toBe(r2.total);
  });
});

describe("formatVatNumber", () => {
  it("converts an org number to SE VAT format", () => {
    expect(formatVatNumber("556677-8899")).toBe("SE556677889901");
  });

  it("strips non-digit characters", () => {
    expect(formatVatNumber("55 66 77-88 99")).toBe("SE556677889901");
  });

  it("handles org number without dashes", () => {
    expect(formatVatNumber("5566778899")).toBe("SE556677889901");
  });
});
