/**
 * Normalisation for CDON order payloads.
 *
 * The CDON Merchant API returns orders from `GET /v1/orders`, but the exact
 * field names vary by integration/version and we couldn't capture a live order
 * (the queue was empty during build-out). This parser is deliberately tolerant:
 * it accepts the common spellings so a real order maps cleanly, and the caller
 * logs the raw payload the first time it sees one so the shape can be confirmed.
 */

export interface CdonParsedRow {
  sku?: string;
  quantity: number;
  rowId?: string;
  title?: string;
  price?: number;
}

export interface CdonParsedOrder {
  orderId: string;
  orderNumber?: string;
  rows: CdonParsedRow[];
  customerName?: string;
  customerEmail?: string;
  total?: number;
  currency?: string;
}

function pick<T>(obj: Record<string, unknown>, keys: string[]): T | undefined {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k] as T;
  }
  return undefined;
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) {
    return Number(v);
  }
  return undefined;
}

function parseRow(raw: Record<string, unknown>): CdonParsedRow {
  return {
    sku: pick<string>(raw, ["sku", "article_sku", "articleSku", "SKU"]),
    quantity: toNumber(pick(raw, ["quantity", "qty", "Quantity"])) ?? 1,
    rowId: pick<string>(raw, [
      "article_row_id",
      "articleRowId",
      "row_id",
      "id",
      "OrderRowId",
    ]),
    title: pick<string>(raw, ["title", "name", "ProductName"]),
    price: toNumber(pick(raw, ["price", "amount", "unit_price", "Price"])),
  };
}

export function parseCdonOrder(raw: unknown): CdonParsedOrder | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const orderId = pick<string | number>(o, [
    "id",
    "order_id",
    "orderId",
    "OrderId",
    "order_key",
    "OrderKey",
  ]);
  if (orderId === undefined) return null;

  const rowsRaw =
    pick<unknown[]>(o, [
      "rows",
      "order_rows",
      "article_rows",
      "items",
      "lines",
      "line_items",
      "OrderRows",
    ]) ?? [];
  const rows = Array.isArray(rowsRaw)
    ? rowsRaw
        .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
        .map(parseRow)
    : [];

  const customer = pick<Record<string, unknown>>(o, [
    "customer",
    "Customer",
    "billing_address",
    "shipping_address",
  ]);

  return {
    orderId: String(orderId),
    orderNumber: pick<string>(o, ["order_number", "orderNumber", "number"]),
    rows,
    customerName:
      pick<string>(o, ["customer_name", "customerName"]) ??
      (customer
        ? [pick(customer, ["first_name", "firstName", "FirstName"]), pick(customer, ["last_name", "lastName", "LastName"])]
            .filter(Boolean)
            .join(" ") || undefined
        : undefined),
    customerEmail:
      pick<string>(o, ["email", "customer_email"]) ??
      (customer ? pick<string>(customer, ["email", "Email"]) : undefined),
    total: toNumber(pick(o, ["total", "total_price", "amount", "TotalAmount"])),
    currency: pick<string>(o, ["currency", "Currency"]),
  };
}
