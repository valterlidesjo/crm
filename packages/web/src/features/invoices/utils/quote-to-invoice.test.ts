import { describe, it, expect } from "vitest";
import { quoteToInvoiceFormData } from "./quote-to-invoice";
import type { Quote } from "@crm/shared";

const BASE_QUOTE: Quote = {
  id: "q1",
  quoteNumber: "Q-20260326-001",
  customerId: "cust-1",
  status: "accepted",
  items: [
    { description: "Consulting", quantity: 5, unitPrice: 2000, vatRate: "25", billingFrequency: "one-time" },
    { description: "Hosting", quantity: 1, unitPrice: 500, vatRate: "12", billingFrequency: "monthly" },
  ],
  subtotal: 10500,
  vatAmount: 2560,
  totalAmount: 13060,
  currency: "SEK",
  validUntil: "2026-04-26",
  language: "sv",
  createdAt: "2026-03-26T00:00:00.000Z",
  updatedAt: "2026-03-26T00:00:00.000Z",
};

const FIXED_DATE = new Date("2026-03-26T12:00:00.000Z");

describe("quoteToInvoiceFormData", () => {
  it("maps customerId, currency, and language from quote", () => {
    const result = quoteToInvoiceFormData(BASE_QUOTE, "REF1", FIXED_DATE);
    expect(result.customerId).toBe("cust-1");
    expect(result.currency).toBe("SEK");
    expect(result.language).toBe("sv");
  });

  it("sets invoiceDate to today", () => {
    const result = quoteToInvoiceFormData(BASE_QUOTE, "REF1", FIXED_DATE);
    expect(result.invoiceDate).toBe("2026-03-26");
  });

  it("sets dueDate to 30 days from today", () => {
    const result = quoteToInvoiceFormData(BASE_QUOTE, "REF1", FIXED_DATE);
    expect(result.dueDate).toBe("2026-04-25");
  });

  it("handles month-boundary due date (Mar 31 → Apr 30)", () => {
    const result = quoteToInvoiceFormData(BASE_QUOTE, "REF1", new Date("2026-03-31T00:00:00.000Z"));
    expect(result.dueDate).toBe("2026-04-30");
  });

  it("maps items from quote, dropping billingFrequency", () => {
    const result = quoteToInvoiceFormData(BASE_QUOTE, "REF1", FIXED_DATE);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({ description: "Consulting", quantity: 5, unitPrice: 2000, vatRate: "25" });
    expect(result.items[1]).toEqual({ description: "Hosting", quantity: 1, unitPrice: 500, vatRate: "12" });
    expect(result.items[0]).not.toHaveProperty("billingFrequency");
  });

  it("copies subtotal, vatAmount, totalAmount from quote", () => {
    const result = quoteToInvoiceFormData(BASE_QUOTE, "REF1", FIXED_DATE);
    expect(result.subtotal).toBe(10500);
    expect(result.vatAmount).toBe(2560);
    expect(result.totalAmount).toBe(13060);
  });

  it("uses provided invoiceRef", () => {
    const result = quoteToInvoiceFormData(BASE_QUOTE, "AB12", FIXED_DATE);
    expect(result.invoiceRef).toBe("AB12");
  });

  it("leaves invoiceNumber empty for auto-generation", () => {
    const result = quoteToInvoiceFormData(BASE_QUOTE, "REF1", FIXED_DATE);
    expect(result.invoiceNumber).toBe("");
  });

  it("applies invoice defaults: draft, not recurring, domestic", () => {
    const result = quoteToInvoiceFormData(BASE_QUOTE, "REF1", FIXED_DATE);
    expect(result.status).toBe("draft");
    expect(result.isRecurring).toBe(false);
    expect(result.isInternational).toBe(false);
    expect(result.overdueInterestRate).toBe(8);
  });

  it("includes notes when present on quote", () => {
    const withNotes = { ...BASE_QUOTE, notes: "Rush order" };
    const result = quoteToInvoiceFormData(withNotes, "REF1", FIXED_DATE);
    expect(result.notes).toBe("Rush order");
  });

  it("omits notes field when quote has no notes", () => {
    const result = quoteToInvoiceFormData(BASE_QUOTE, "REF1", FIXED_DATE);
    expect(result).not.toHaveProperty("notes");
  });

  it("defaults currency to SEK when missing", () => {
    const noC = { ...(BASE_QUOTE as Record<string, unknown>) };
    delete noC.currency;
    // @ts-expect-error testing partial data
    const result = quoteToInvoiceFormData({ ...noC } as Quote, "REF1", FIXED_DATE);
    expect(result.currency).toBe("SEK");
  });

  it("defaults language to sv when missing", () => {
    const noL = { ...(BASE_QUOTE as Record<string, unknown>) };
    delete noL.language;
    // @ts-expect-error testing partial data
    const result = quoteToInvoiceFormData({ ...noL } as Quote, "REF1", FIXED_DATE);
    expect(result.language).toBe("sv");
  });

  it("defaults vatRate to '25' when missing from quote item", () => {
    const quote = {
      ...BASE_QUOTE,
      items: [{ description: "Item", quantity: 1, unitPrice: 100, billingFrequency: "one-time" as const }],
    };
    // @ts-expect-error testing partial item
    const result = quoteToInvoiceFormData(quote, "REF1", FIXED_DATE);
    expect(result.items[0].vatRate).toBe("25");
  });
});
