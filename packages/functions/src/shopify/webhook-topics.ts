import { getFirestore } from "firebase-admin/firestore";
import { googleCategoryForProductType } from "./category";

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
  id?: number;
  order_id: number;
  refund_line_items: ShopifyRefundLineItem[];
}

export interface ShopifyProductPayload {
  id: number;
  title?: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
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
    // Never rewrite createdAt on the update path — re-deliveries and the
    // hourly reconcile would otherwise clobber it on every pass.
    const { createdAt: _createdAt, ...update } = data;
    await ref.update({ ...update, updatedAt: new Date().toISOString() });
  } else {
    await ref.set({ id: docId, ...data });
  }
}

type DocRef = FirebaseFirestore.DocumentReference;
type Tx = FirebaseFirestore.Transaction;

// Resolve each line item to its CRM article ref (matched by shopifyVariantId).
// Queries can't run inside our transactions, so refs are resolved up front and
// the stock mutation happens transactionally on the refs.
async function resolveArticleRefs(
  db: DB,
  partnerId: string,
  lineItems: Array<{ variant_id: number; quantity: number }>
): Promise<Array<{ ref: DocRef; quantity: number }>> {
  const resolved: Array<{ ref: DocRef; quantity: number }> = [];
  for (const lineItem of lineItems) {
    const snap = await db
      .collection(`partners/${partnerId}/products`)
      .where("shopifyVariantId", "==", variantGid(lineItem.variant_id))
      .limit(1)
      .get();
    if (snap.empty) continue;
    resolved.push({ ref: snap.docs[0].ref, quantity: lineItem.quantity });
  }
  return resolved;
}

// Upsert an order doc inside a transaction. The update path never rewrites
// createdAt (see upsertOrder).
function writeOrderInTx(
  tx: Tx,
  ref: DocRef,
  exists: boolean,
  data: Record<string, unknown>
): void {
  if (exists) {
    const { createdAt: _createdAt, ...update } = data;
    tx.update(ref, update);
  } else {
    tx.set(ref, { id: ref.id, ...data });
  }
}

// Create or update one article per Shopify variant. Group-level fields
// (title, vendor, description) are written onto every article in the group;
// per-article fields (sku, stock, price) come from the variant.
async function upsertArticlesFromProduct(
  db: DB,
  partnerId: string,
  payload: ShopifyProductPayload,
  // CRM is the source of truth for stock AND price. On products/update we
  // refresh metadata (title/vendor/…) but must NOT clobber CRM stock or price
  // on existing articles. New articles seed both from Shopify.
  setStockOnExisting = true,
  setPriceOnExisting = true
): Promise<void> {
  const shopifyProductId = productGid(payload.id);
  const now = new Date().toISOString();
  const groupTitle = payload.title ?? "";
  const description = payload.body_html
    ? payload.body_html.replace(/<[^>]+>/g, "").trim()
    : undefined;
  const productType = payload.product_type?.trim() || undefined;
  const googleProductCategory = googleCategoryForProductType(productType);

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
      ...(productType && { productType }),
      ...(googleProductCategory && { googleProductCategory }),
      ...(v.sku && { sku: v.sku }),
      status: "active",
      shopifyProductId,
      shopifyVariantId: vGid,
      updatedAt: now,
    };
    const variantPrice = parseFloat(v.price);

    const existingRef = existingByVariant.get(vGid);
    if (existingRef) {
      if (setStockOnExisting) fields.stock = v.inventory_quantity ?? 0;
      if (setPriceOnExisting && variantPrice) fields.price = variantPrice;
      await existingRef.update(fields);
    } else {
      const docId = `shopify-variant-${v.id}`;
      await col.doc(docId).set({
        id: docId,
        ...fields,
        ...(variantPrice && { price: variantPrice }),
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
  const orderRef = db
    .collection(`partners/${partnerId}/orders`)
    .doc(String(payload.id));
  const articles = await resolveArticleRefs(db, partnerId, payload.line_items ?? []);

  // One transaction: the idempotency check, the stock decrement and the
  // stockApplied flag commit atomically. Duplicate deliveries (webhook retry,
  // hourly reconcile) contend on the order doc and the loser sees the flag;
  // concurrent orders on the same article contend on the article doc, so no
  // decrement can be lost to a read-modify-write race.
  await db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    const existing = orderSnap.exists
      ? (orderSnap.data() as Record<string, unknown>)
      : undefined;
    const alreadyApplied = wasStockApplied(existing);

    // All reads must precede writes inside a Firestore transaction.
    const articleSnaps = alreadyApplied
      ? []
      : await Promise.all(articles.map((a) => tx.get(a.ref)));

    writeOrderInTx(tx, orderRef, orderSnap.exists, {
      ...buildOrderDoc(payload, "paid", now),
      stockApplied: true,
    });

    articleSnaps.forEach((snap, i) => {
      const current = (snap.data()?.stock as number | undefined) ?? 0;
      tx.update(articles[i].ref, {
        stock: Math.max(0, current - articles[i].quantity),
        updatedAt: now,
      });
    });
  });
}

export async function handleOrderCancelled(
  db: DB,
  partnerId: string,
  payload: ShopifyOrderPayload
): Promise<void> {
  const now = new Date().toISOString();
  const orderRef = db
    .collection(`partners/${partnerId}/orders`)
    .doc(String(payload.id));
  const articles = await resolveArticleRefs(db, partnerId, payload.line_items ?? []);

  // Only restore stock if this order's sale had actually been applied — and
  // never restore twice (the flag flips to false in the same transaction, so
  // duplicate cancellation deliveries are no-ops).
  await db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    const existing = orderSnap.exists
      ? (orderSnap.data() as Record<string, unknown>)
      : undefined;
    const shouldRestore = wasStockApplied(existing);

    const articleSnaps = shouldRestore
      ? await Promise.all(articles.map((a) => tx.get(a.ref)))
      : [];

    writeOrderInTx(tx, orderRef, orderSnap.exists, {
      ...buildOrderDoc(payload, "cancelled", now),
      status: "cancelled",
      stockApplied: false,
    });

    articleSnaps.forEach((snap, i) => {
      const current = (snap.data()?.stock as number | undefined) ?? 0;
      tx.update(articles[i].ref, {
        stock: current + articles[i].quantity,
        updatedAt: now,
      });
    });
  });
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
  const orderRef = db
    .collection(`partners/${partnerId}/orders`)
    .doc(String(payload.order_id));

  // Restock only "return" refunds here. A cancellation-with-restock makes
  // Shopify emit BOTH refunds/create (restock_type "cancel") AND
  // orders/cancelled — the cancel handler owns that restock; restoring here
  // as well would double it.
  const restockItems = payload.refund_line_items
    .filter((rli) => rli.restock_type === "return")
    .map((rli) => ({
      variant_id: rli.line_item.variant_id,
      quantity: rli.quantity,
    }));
  const articles = await resolveArticleRefs(db, partnerId, restockItems);

  await db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    const existing = orderSnap.exists
      ? (orderSnap.data() as Record<string, unknown>)
      : undefined;

    // Refund deliveries are at-least-once — track applied refund ids on the
    // order doc so a duplicate delivery never restocks twice.
    const appliedIds = Array.isArray(existing?.appliedRefundIds)
      ? (existing.appliedRefundIds as number[])
      : [];
    const isDuplicate = payload.id !== undefined && appliedIds.includes(payload.id);

    const articleSnaps = isDuplicate
      ? []
      : await Promise.all(articles.map((a) => tx.get(a.ref)));

    const orderUpdate: Record<string, unknown> = {
      status: "refunded",
      updatedAt: now,
    };
    if (payload.id !== undefined && !isDuplicate) {
      orderUpdate.appliedRefundIds = [...appliedIds, payload.id];
    }
    if (orderSnap.exists) {
      tx.update(orderRef, orderUpdate);
    } else {
      tx.set(orderRef, { id: orderRef.id, ...orderUpdate });
    }

    articleSnaps.forEach((snap, i) => {
      const current = (snap.data()?.stock as number | undefined) ?? 0;
      tx.update(articles[i].ref, {
        stock: current + articles[i].quantity,
        updatedAt: now,
      });
    });
  });
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

  // Refresh metadata only — CRM owns stock AND price, so don't overwrite
  // them here. Drift from manual Shopify edits is intentionally ignored;
  // the next CRM change re-asserts the canonical value.
  await upsertArticlesFromProduct(db, partnerId, payload, false, false);
}
