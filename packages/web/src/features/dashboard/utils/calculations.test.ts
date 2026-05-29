import { describe, it, expect } from "vitest";
import type { Customer, JournalEntry, Product, Meeting } from "@crm/shared";
import {
  countActiveCustomers,
  calculateMrr,
  calculateTotalIncome,
  calculateShopifyRevenue,
  calculateShopifyOrderCount,
  calculateInventoryRetailValue,
  calculateInventoryCostValue,
  calculateInventoryUnitCount,
  countMeetingsThisWeek,
} from "./calculations";

const makeCustomer = (
  status: Customer["status"],
  mrr?: number
): Customer => ({
  id: "c1",
  name: "Test Co",
  location: "Stockholm",
  phone: "+46701234567",
  email: "test@example.com",
  status,
  categoryOfWork: "IT",
  ...(mrr !== undefined && { mrr }),
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
});

const makeJournalEntry = (
  transactionType: "income" | "cost",
  totalAmount: number,
  source?: JournalEntry["source"]
): JournalEntry => ({
  id: "je1",
  date: "2025-01-01",
  description: "Test entry",
  transactionType,
  category: "sales",
  totalAmount,
  vatRate: "25",
  vatAmount: totalAmount * 0.25,
  lines: [],
  ...(source !== undefined && { source }),
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
});

// Each article is a flat product document. Tests pass one or more articles
// (previously expressed as variants) — they are now independent products.
let articleCounter = 0;
const makeArticles = (
  articles: Array<{ stock: number; price?: number; costPrice?: number }>,
  status: "active" | "archived" = "active"
): Product[] =>
  articles.map((a) => ({
    id: `p${articleCounter++}`,
    title: "Test Article",
    status,
    stock: a.stock,
    ...(a.price !== undefined && { price: a.price }),
    ...(a.costPrice !== undefined && { costPrice: a.costPrice }),
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  }));

const makeMeeting = (startTime: string): Meeting => ({
  id: "m1",
  title: "Test Meeting",
  startTime,
  endTime: startTime,
  allDay: false,
  attendees: [],
  sendNotifications: false,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
});

describe("countActiveCustomers", () => {
  it("should count customers with mrr status", () => {
    const customers = [makeCustomer("mrr"), makeCustomer("lost")];
    expect(countActiveCustomers(customers)).toBe(1);
  });

  it("should count customers with in_progress status", () => {
    const customers = [makeCustomer("in_progress"), makeCustomer("contacted")];
    expect(countActiveCustomers(customers)).toBe(1);
  });

  it("should count both mrr and in_progress", () => {
    const customers = [
      makeCustomer("mrr"),
      makeCustomer("in_progress"),
      makeCustomer("warm"),
    ];
    expect(countActiveCustomers(customers)).toBe(2);
  });

  it("should return 0 for empty array", () => {
    expect(countActiveCustomers([])).toBe(0);
  });

  it("should return 0 when no active customers", () => {
    const customers = [
      makeCustomer("not_contacted"),
      makeCustomer("lost"),
      makeCustomer("completed"),
    ];
    expect(countActiveCustomers(customers)).toBe(0);
  });
});

describe("calculateMrr", () => {
  it("should sum MRR from customers with mrr status and mrr value", () => {
    const customers = [
      makeCustomer("mrr", 10000),
      makeCustomer("mrr", 5000),
    ];
    expect(calculateMrr(customers)).toBe(15000);
  });

  it("should exclude customers without mrr status", () => {
    const customers = [
      makeCustomer("mrr", 10000),
      makeCustomer("in_progress", 5000),
      makeCustomer("warm", 3000),
    ];
    expect(calculateMrr(customers)).toBe(10000);
  });

  it("should exclude customers with mrr status but no mrr value", () => {
    const customers = [
      makeCustomer("mrr", 10000),
      makeCustomer("mrr"), // no mrr value
    ];
    expect(calculateMrr(customers)).toBe(10000);
  });

  it("should return 0 for empty array", () => {
    expect(calculateMrr([])).toBe(0);
  });

  it("should return 0 when no customers have mrr status", () => {
    const customers = [
      makeCustomer("contacted", 5000),
      makeCustomer("warm", 3000),
    ];
    expect(calculateMrr(customers)).toBe(0);
  });
});

describe("calculateTotalIncome", () => {
  it("should sum all income journal entries", () => {
    const entries = [
      makeJournalEntry("income", 10000),
      makeJournalEntry("income", 5000),
    ];
    expect(calculateTotalIncome(entries)).toBe(15000);
  });

  it("should exclude cost entries", () => {
    const entries = [
      makeJournalEntry("income", 10000),
      makeJournalEntry("cost", 5000),
      makeJournalEntry("income", 3000),
    ];
    expect(calculateTotalIncome(entries)).toBe(13000);
  });

  it("should return 0 for empty array", () => {
    expect(calculateTotalIncome([])).toBe(0);
  });

  it("should return 0 when no income entries", () => {
    const entries = [
      makeJournalEntry("cost", 5000),
      makeJournalEntry("cost", 3000),
    ];
    expect(calculateTotalIncome(entries)).toBe(0);
  });
});

describe("calculateShopifyRevenue", () => {
  it("sums income entries with source=shopify", () => {
    const entries = [
      makeJournalEntry("income", 10000, "shopify"),
      makeJournalEntry("income", 5000, "shopify"),
    ];
    expect(calculateShopifyRevenue(entries)).toBe(15000);
  });

  it("excludes manual income entries", () => {
    const entries = [
      makeJournalEntry("income", 10000, "shopify"),
      makeJournalEntry("income", 5000, "manual"),
      makeJournalEntry("income", 3000),
    ];
    expect(calculateShopifyRevenue(entries)).toBe(10000);
  });

  it("excludes shopify cost entries", () => {
    const entries = [
      makeJournalEntry("income", 10000, "shopify"),
      makeJournalEntry("cost", 2000, "shopify"),
    ];
    expect(calculateShopifyRevenue(entries)).toBe(10000);
  });

  it("returns 0 for empty array", () => {
    expect(calculateShopifyRevenue([])).toBe(0);
  });

  it("returns 0 when no shopify entries", () => {
    expect(calculateShopifyRevenue([makeJournalEntry("income", 5000, "manual")])).toBe(0);
  });
});

describe("calculateShopifyOrderCount", () => {
  it("counts entries with source=shopify regardless of transaction type", () => {
    const entries = [
      makeJournalEntry("income", 10000, "shopify"),
      makeJournalEntry("income", 5000, "shopify"),
      makeJournalEntry("income", 3000, "manual"),
    ];
    expect(calculateShopifyOrderCount(entries)).toBe(2);
  });

  it("returns 0 when no shopify entries", () => {
    expect(calculateShopifyOrderCount([makeJournalEntry("income", 5000)])).toBe(0);
  });

  it("returns 0 for empty array", () => {
    expect(calculateShopifyOrderCount([])).toBe(0);
  });
});

describe("calculateInventoryRetailValue", () => {
  it("sums stock × price across all active variants", () => {
    const products = makeArticles([{ stock: 10, price: 500 }, { stock: 5, price: 300 }]);
    expect(calculateInventoryRetailValue(products)).toBe(6500);
  });

  it("treats missing price as 0", () => {
    const products = makeArticles([{ stock: 10 }]);
    expect(calculateInventoryRetailValue(products)).toBe(0);
  });

  it("excludes archived products", () => {
    const products = [...makeArticles([{ stock: 10, price: 500 }]), ...makeArticles([{ stock: 5, price: 300 }], "archived")];
    expect(calculateInventoryRetailValue(products)).toBe(5000);
  });

  it("returns 0 for empty array", () => {
    expect(calculateInventoryRetailValue([])).toBe(0);
  });
});

describe("calculateInventoryCostValue", () => {
  it("sums stock × costPrice across active variants", () => {
    const products = makeArticles([{ stock: 10, costPrice: 200 }, { stock: 5, costPrice: 100 }]);
    expect(calculateInventoryCostValue(products)).toBe(2500);
  });

  it("treats missing costPrice as 0 (graceful fallback until TODO-D3 data exists)", () => {
    const products = makeArticles([{ stock: 10 }]);
    expect(calculateInventoryCostValue(products)).toBe(0);
  });

  it("returns 0 for empty array", () => {
    expect(calculateInventoryCostValue([])).toBe(0);
  });
});

describe("calculateInventoryUnitCount", () => {
  it("sums stock across all active variants", () => {
    const products = [...makeArticles([{ stock: 10 }, { stock: 5 }]), ...makeArticles([{ stock: 3 }])];
    expect(calculateInventoryUnitCount(products)).toBe(18);
  });

  it("excludes archived products", () => {
    const products = [...makeArticles([{ stock: 10 }]), ...makeArticles([{ stock: 5 }], "archived")];
    expect(calculateInventoryUnitCount(products)).toBe(10);
  });

  it("returns 0 for empty array", () => {
    expect(calculateInventoryUnitCount([])).toBe(0);
  });
});

describe("countMeetingsThisWeek", () => {
  // Reference: 2026-03-16 is a Monday
  const MONDAY = new Date("2026-03-16T10:00:00");

  it("counts meetings in the current week (Mon–Sun)", () => {
    const meetings = [
      makeMeeting("2026-03-16T09:00:00"), // Monday — in
      makeMeeting("2026-03-18T14:00:00"), // Wednesday — in
      makeMeeting("2026-03-22T10:00:00"), // Sunday — in
    ];
    expect(countMeetingsThisWeek(meetings, MONDAY)).toBe(3);
  });

  it("excludes meetings from previous week", () => {
    const meetings = [
      makeMeeting("2026-03-15T10:00:00"), // Sunday of previous week — out
      makeMeeting("2026-03-16T10:00:00"), // Monday — in
    ];
    expect(countMeetingsThisWeek(meetings, MONDAY)).toBe(1);
  });

  it("excludes meetings from next week", () => {
    const meetings = [
      makeMeeting("2026-03-22T23:59:00"), // Sunday — in
      makeMeeting("2026-03-23T00:00:00"), // Next Monday — out
    ];
    expect(countMeetingsThisWeek(meetings, MONDAY)).toBe(1);
  });

  it("returns 0 for empty array", () => {
    expect(countMeetingsThisWeek([], MONDAY)).toBe(0);
  });

  it("handles Sunday as reference date (week starts Monday)", () => {
    const SUNDAY = new Date("2026-03-22T10:00:00"); // Sunday of same week
    const meetings = [
      makeMeeting("2026-03-16T10:00:00"), // Monday of that week — in
      makeMeeting("2026-03-22T23:00:00"), // Sunday of that week — in
    ];
    expect(countMeetingsThisWeek(meetings, SUNDAY)).toBe(2);
  });
});
