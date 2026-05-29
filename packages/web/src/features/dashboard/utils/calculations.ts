import type { Customer, JournalEntry, Product, Meeting } from "@crm/shared";

export function countActiveCustomers(customers: Customer[]): number {
  return customers.filter(
    (c) => c.status === "mrr" || c.status === "in_progress"
  ).length;
}

export function calculateMrr(customers: Customer[]): number {
  return customers
    .filter((c) => c.status === "mrr" && c.mrr)
    .reduce((sum, c) => sum + (c.mrr ?? 0), 0);
}

export function calculateTotalIncome(entries: JournalEntry[]): number {
  return entries
    .filter((e) => e.transactionType === "income")
    .reduce((sum, e) => sum + e.totalAmount, 0);
}

/** Revenue from entries with source='shopify'. Entries are assumed pre-filtered by date range. */
export function calculateShopifyRevenue(entries: JournalEntry[]): number {
  return entries
    .filter((e) => e.transactionType === "income" && e.source === "shopify")
    .reduce((sum, e) => sum + e.totalAmount, 0);
}

/** Count of entries with source='shopify'. Entries are assumed pre-filtered by date range. */
export function calculateShopifyOrderCount(entries: JournalEntry[]): number {
  return entries.filter((e) => e.source === "shopify").length;
}

/** Inventory value at retail price: Σ (stock × price) across all active articles. */
export function calculateInventoryRetailValue(products: Product[]): number {
  return products
    .filter((p) => p.status === "active")
    .reduce((sum, p) => sum + p.stock * (p.price ?? 0), 0);
}

/** Inventory value at cost price: Σ (stock × costPrice) across all active articles.
 *  Returns 0 for articles without costPrice. */
export function calculateInventoryCostValue(products: Product[]): number {
  return products
    .filter((p) => p.status === "active")
    .reduce((sum, p) => sum + p.stock * (p.costPrice ?? 0), 0);
}

/** Total stock units across all active articles. */
export function calculateInventoryUnitCount(products: Product[]): number {
  return products
    .filter((p) => p.status === "active")
    .reduce((sum, p) => sum + p.stock, 0);
}

/**
 * Count of meetings with startTime in the current calendar week (Mon–Sun).
 * Week starts on Monday to align with Swedish convention.
 */
export function countMeetingsThisWeek(meetings: Meeting[], today = new Date()): number {
  // Get Monday of the current week
  const dayOfWeek = today.getDay(); // 0 = Sun, 1 = Mon, …
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysFromMonday);
  monday.setHours(0, 0, 0, 0);

  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);

  return meetings.filter((m) => {
    const start = new Date(m.startTime);
    return start >= monday && start < nextMonday;
  }).length;
}
