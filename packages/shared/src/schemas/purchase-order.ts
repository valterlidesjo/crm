import { Schema } from "effect";

/**
 * Supported currencies for purchase orders.
 * SEK is the default / reporting currency.
 *
 * Conversion flow:
 *   unitPriceInCurrency × rateToSEK × (1 + markupPercent / 100) = costPerUnitSEK
 *   totalCostSEK = Σ (quantity × costPerUnitSEK) per item
 *
 * markupPercent covers landed costs: freight, customs, handling.
 * It is set once at the PO level and applies to all items equally.
 */
export const Currency = Schema.Literal("SEK", "EUR", "USD", "CNY");
export type Currency = typeof Currency.Type;

export const CURRENCY_LABELS: Record<Currency, string> = {
  SEK: "SEK – Kronor",
  EUR: "EUR – Euro",
  USD: "USD – Dollar",
  CNY: "CNY – Yuan",
};

export const PurchaseOrderStatus = Schema.Literal(
  "pending",
  "received",
  "cancelled"
);
export type PurchaseOrderStatus = typeof PurchaseOrderStatus.Type;

/**
 * One line item in a purchase order.
 *
 * rateToSEK is the exchange rate at time of order creation — stored as a
 * snapshot so historical costs are immutable even if rates change later.
 */
export const PurchaseOrderItem = Schema.Struct({
  productId: Schema.String,
  /** Legacy — articles are now standalone products. Kept optional for old POs. */
  variantId: Schema.optional(Schema.String),
  productTitle: Schema.String,
  /** Legacy — kept optional for old POs created before the variant split. */
  variantTitle: Schema.optional(Schema.String),
  quantity: Schema.Number,
  unitPriceInCurrency: Schema.Number,
  currency: Currency,
  /** How many SEK 1 unit of the chosen currency equals, e.g. 1 CNY = 0.145 SEK */
  rateToSEK: Schema.Number,
  /** Computed and stored: quantity × unitPriceInCurrency × rateToSEK × (1 + markupPercent/100) */
  totalCostSEK: Schema.Number,
});
export type PurchaseOrderItem = typeof PurchaseOrderItem.Type;

export const PurchaseOrder = Schema.Struct({
  id: Schema.String,
  supplierName: Schema.String,
  orderDate: Schema.String,
  expectedDeliveryDate: Schema.optional(Schema.String),
  status: PurchaseOrderStatus,
  /**
   * Percentage markup applied to ALL items to account for freight, customs, etc.
   * e.g. 15 means 15% added on top of the currency-converted price.
   * Defaults to 0 if not set.
   */
  markupPercent: Schema.optional(Schema.Number),
  /** Accounting category id — should be goods_purchase, goods_purchase_eu, or goods_purchase_non_eu */
  accountingCategoryId: Schema.String,
  items: Schema.Array(PurchaseOrderItem),
  /** Sum of all item totalCostSEK. Stored as snapshot at creation time. */
  totalCostSEK: Schema.Number,
  notes: Schema.optional(Schema.String),
  receivedAt: Schema.optional(Schema.String),
  /** Set after receipt — links to the generated journal entry */
  journalEntryId: Schema.optional(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type PurchaseOrder = typeof PurchaseOrder.Type;

// ---------------------------------------------------------------------------
// Pure calculation functions — used in UI (live preview) and hook (on save).
// Keeping them here avoids duplication between add-dialog and receive-dialog.
// ---------------------------------------------------------------------------

/**
 * Calculates the total SEK cost for one PO line item.
 *
 * @param quantity       Number of units
 * @param unitPrice      Price per unit in the chosen currency
 * @param rateToSEK      Exchange rate: 1 unit of currency = X SEK
 * @param markupPercent  Optional markup for freight/customs (e.g. 15 = +15%)
 * @returns              Rounded to 2 decimal places
 */
export function calculateItemCostSEK(
  quantity: number,
  unitPrice: number,
  rateToSEK: number,
  markupPercent?: number
): number {
  const markup = markupPercent ?? 0;
  const raw = quantity * unitPrice * rateToSEK * (1 + markup / 100);
  return Math.round(raw * 100) / 100;
}

/**
 * Calculates total SEK cost across all PO items.
 * Each item has its own quantity, price, and rate already embedded.
 */
export function calculatePOTotalSEK(
  items: Array<{
    quantity: number;
    unitPriceInCurrency: number;
    rateToSEK: number;
  }>,
  markupPercent?: number
): number {
  const total = items.reduce(
    (sum, item) =>
      sum +
      calculateItemCostSEK(
        item.quantity,
        item.unitPriceInCurrency,
        item.rateToSEK,
        markupPercent
      ),
    0
  );
  return Math.round(total * 100) / 100;
}
