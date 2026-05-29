import { getFirestore } from "firebase-admin/firestore";

type DB = ReturnType<typeof getFirestore>;

// ─── Shopify payload interfaces ───────────────────────────────────────────────

export interface ShopifyLineItemPayload {
  product_id?: number;
  variant_id: number;
  quantity: number;
  title: string;
  variant_title?: string;
  sku?: string;
  price: string;
}

export interface ShopifyOrderPayload {
  id: number;
  name: string;
  total_price: string;
  currency: string;
  customer?: { first_name?: string; last_name?: string; email?: string };
  line_items: ShopifyLineItemPayload[];
}

export interface ShopifyRefundLineItem {
  line_item: ShopifyLineItemPayload;
  restock_type: string;
  quantity: number;
}

export interface ShopifyRefundPayload {
  order_id: number;
  refund_line_items: ShopifyRefundLineItem[];
}

export interface ShopifyProductPayload {
  id: number;
  title?: string;
  body_html?: string;
  vendor?: string;
  variants?: Array<{
    id: number;
    title: string;
    sku?: string;
    price: string;
    inventory_quantity?: number;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function orderGid(id: number) {
  return `gid://shopify/Order/${id}`;
}

function variantGid(id: number) {
  return `gid://shopify/ProductVariant/${id}`;
}

function productGid(id: number) {
  return `gid://shopify/Product/${id}`;
}

function mapLineItems(items: ShopifyLineItemPayload[]) {
  return items.map((li) => ({
    productTitle: li.title,
    variantTitle: li.variant_title ?? "",
    sku: li.sku ?? "",
    shopifyVariantId: variantGid(li.variant_id),
    quantity: li.quantity,
    price: parseFloat(li.price),
  }));
}

// Order states in which the sale has already been reflected in stock.
const STOCK_APPLIED_STATES = new Set(["paid", "fulfilled", "partially_refunded"]);

// Whether a previously-stored order already had its sale applied to stock.
// Honours the explicit `stockApplied` flag; falls back to status for legacy docs.
function wasStockApplied(existing: Record<string, unknown> | undefined): boolean {
  if (!existing) return false;
  if (existing.stockApplied === true) return true;
  if (existing.stockApplied === false) return false;
  return STOCK_APPLIED_STATES.has(existing.status as string);
}

async function getOrder(
  db: DB,
  partnerId: string,
  orderId: number
): Promise<Record<string, unknown> | undefined> {
  const snap = await db
    .collection(`partners/${partnerId}/orders`)
    .doc(String(orderId))
    .get();
  return snap.exists ? (snap.data() as Record<string, unknown>) : undefined;
}

function buildOrderDoc(
  payload: ShopifyOrderPayload,
  status: string,
  now: string
) {
  const customer = payload.customer;
  const nameParts = [customer?.first_name, customer?.last_name].filter(Boolean);
  return {
    source: "shopify",
    shopifyOrderId: orderGid(payload.id),
    orderNumber: payload.name,
    status,
    lineItems: mapLineItems(payload.line_items),
    totalPrice: parseFloat(payload.total_price),
    currency: payload.currency,
    customerName: nameParts.join(" ") || undefined,
    customerEmail: customer?.email ?? undefined,
    createdAt: now,
    updatedAt: now,
  };
}

// Upsert an order document keyed by the numeric Shopify order ID.
async function upsertOrder(
  db: DB,
  partnerId: string,
  orderId: number,
  data: Record<string, unknown>
): Promise<void> {
  const docId = String(orderId);
  const ref = db.collection(`partners/${partnerId}/orders`).doc(docId);
  const snap = await ref.get();
  if (snap.exists) {
    await ref.update({ ...data, updatedAt: new Date().toISOString() });
  } else {
    await ref.set({ id: docId, ...data });
  }
}

// Adjust stock for a list of line items (delta = positive → add, negative → subtract).
// Each line item maps to a single article matched by shopifyVariantId.
async function adjustStock(
  db: DB,
  partnerId: string,
  lineItems: Array<{ variant_id: number; quantity: number }>,
  delta: 1 | -1
): Promise<void> {
  const now = new Date().toISOString();

  for (const lineItem of lineItems) {
    const shopifyVariantId = variantGid(lineItem.variant_id);

    const snap = await db
      .collection(`partners/${partnerId}/products`)
      .where("shopifyVariantId", "==", shopifyVariantId)
      .limit(1)
      .get();
    if (snap.empty) continue;

    const docRef = snap.docs[0].ref;
    const current = (snap.docs[0].data().stock as number) ?? 0;
    const newStock = Math.max(0, current + delta * lineItem.quantity);
    await docRef.update({ stock: newStock, updatedAt: now });
  }
}

// Create or update one article per Shopify variant. Group-level fields
// (title, vendor, description) are written onto every article in the group;
// per-article fields (sku, price, stock) come from the variant.
async function upsertArticlesFromProduct(
  db: DB,
  partnerId: string,
  payload: ShopifyProductPayload,
  // CRM is the source of truth for stock. On products/update we refresh
  // metadata (title/price/…) but must NOT clobber CRM stock on existing
  // articles. New articles always get their initial stock from Shopify.
  setStockOnExisting = true
): Promise<void> {
  const shopifyProductId = productGid(payload.id);
  const now = new Date().toISOString();
  const groupTitle = payload.title ?? "";
  const description = payload.body_html
    ? payload.body_html.replace(/<[^>]+>/g, "").trim()
    : undefined;

  const col = db.collection(`partners/${partnerId}/products`);
  const existingSnap = await col
    .where("shopifyProductId", "==", shopifyProductId)
    .get();
  const existingByVariant = new Map<string, FirebaseFirestore.DocumentReference>();
  for (const d of existingSnap.docs) {
    const vId = d.data().shopifyVariantId as string | undefined;
    if (vId) existingByVariant.set(vId, d.ref);
  }

  const variants = payload.variants ?? [];
  const isSingle = variants.length === 1;

  for (const v of variants) {
    const vGid = variantGid(v.id);
    const isDefault = isSingle || v.title.toLowerCase() === "default title";
    const title = isDefault ? groupTitle : `${groupTitle} – ${v.title}`;

    const fields: Record<string, unknown> = {
      title,
      groupTitle,
      ...(description !== undefined && { description }),
      ...(payload.vendor && { vendor: payload.vendor }),
      ...(v.sku && { sku: v.sku }),
      price: parseFloat(v.price),
      status: "active",
      shopifyProductId,
      shopifyVariantId: vGid,
      updatedAt: now,
    };

    const existingRef = existingByVariant.get(vGid);
    if (existingRef) {
      if (setStockOnExisting) fields.stock = v.inventory_quantity ?? 0;
      await existingRef.update(fields);
    } else {
      const docId = `shopify-variant-${v.id}`;
      await col.doc(docId).set({
        id: docId,
        ...fields,
        stock: v.inventory_quantity ?? 0,
        createdAt: now,
      });
    }
  }
}

// ─── Topic handlers ───────────────────────────────────────────────────────────

export async function handleOrderCreate(
  db: DB,
  partnerId: string,
  payload: ShopifyOrderPayload
): Promise<void> {
  const now = new Date().toISOString();
  await upsertOrder(db, partnerId, payload.id, buildOrderDoc(payload, "pending", now));
}

export async function handleOrderPaid(
  db: DB,
  partnerId: string,
  payload: ShopifyOrderPayload
): Promise<void> {
  const now = new Date().toISOString();
  // Idempotent: Shopify may deliver orders/paid more than once, and the hourly
  // reconciliation may re-see the same order. Only decrement stock the first time.
  const alreadyApplied = wasStockApplied(await getOrder(db, partnerId, payload.id));
  await upsertOrder(db, partnerId, payload.id, {
    ...buildOrderDoc(payload, "paid", now),
    stockApplied: true,
  });
  if (!alreadyApplied && payload.line_items?.length) {
    await adjustStock(db, partnerId, payload.line_items, -1);
  }
}

export async function handleOrderCancelled(
  db: DB,
  partnerId: string,
  payload: ShopifyOrderPayload
): Promise<void> {
  const now = new Date().toISOString();
  // Only restore stock if this order's sale had actually been applied — and
  // never restore twice (guards duplicate cancellation deliveries).
  const shouldRestore = wasStockApplied(await getOrder(db, partnerId, payload.id));
  await upsertOrder(db, partnerId, payload.id, {
    ...buildOrderDoc(payload, "cancelled", now),
    status: "cancelled",
    stockApplied: false,
  });
  if (shouldRestore && payload.line_items?.length) {
    await adjustStock(db, partnerId, payload.line_items, 1);
  }
}

export async function handleOrderFulfilled(
  db: DB,
  partnerId: string,
  payload: ShopifyOrderPayload
): Promise<void> {
  const now = new Date().toISOString();
  await upsertOrder(db, partnerId, payload.id, {
    ...buildOrderDoc(payload, "fulfilled", now),
    status: "fulfilled",
  });
}

export async function handleRefundCreate(
  db: DB,
  partnerId: string,
  payload: ShopifyRefundPayload
): Promise<void> {
  const now = new Date().toISOString();
  await upsertOrder(db, partnerId, payload.order_id, {
    status: "refunded",
    updatedAt: now,
  });

  const restockItems = payload.refund_line_items
    .filter((rli) => rli.restock_type === "return" || rli.restock_type === "cancel")
    .map((rli) => ({
      variant_id: rli.line_item.variant_id,
      quantity: rli.quantity,
    }));

  if (restockItems.length) {
    await adjustStock(db, partnerId, restockItems, 1);
  }
}

export async function handleProductCreate(
  db: DB,
  partnerId: string,
  payload: ShopifyProductPayload
): Promise<void> {
  // Idempotent: upsert keyed by shopifyVariantId. One article per variant.
  await upsertArticlesFromProduct(db, partnerId, payload);
}

export async function handleProductDelete(
  db: DB,
  partnerId: string,
  payload: { id: number }
): Promise<void> {
  const shopifyProductId = productGid(payload.id);
  const snap = await db
    .collection(`partners/${partnerId}/products`)
    .where("shopifyProductId", "==", shopifyProductId)
    .get();

  if (snap.empty) return;
  const now = new Date().toISOString();
  // Archive every article belonging to the deleted Shopify product.
  await Promise.all(
    snap.docs.map((d) => d.ref.update({ status: "archived", updatedAt: now }))
  );
}

export async function handleProductUpdate(
  db: DB,
  partnerId: string,
  payload: ShopifyProductPayload
): Promise<void> {
  // Only touch articles if the Shopify product already maps into CRM.
  const shopifyProductId = productGid(payload.id);
  const existing = await db
    .collection(`partners/${partnerId}/products`)
    .where("shopifyProductId", "==", shopifyProductId)
    .limit(1)
    .get();
  if (existing.empty) return;

  // Refresh metadata only — CRM owns stock, so don't overwrite it here.
  await upsertArticlesFromProduct(db, partnerId, payload, false);
}
