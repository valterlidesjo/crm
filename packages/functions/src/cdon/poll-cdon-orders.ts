import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import {
  loadCdonConfig,
  listOrders,
  acceptOrderRow,
  partnersWithCdon,
  type CdonConfig,
} from "./cdon-client.js";
import { parseCdonOrder, type CdonParsedRow } from "./cdon-order.js";
import { requireSuperAdmin } from "../lib/require-super-admin.js";

type DB = ReturnType<typeof getFirestore>;

// Resolve a CDON SKU to its CRM article ref (matches cdonSku, then sku).
// Queries can't run inside a transaction, so refs are resolved up front.
async function resolveSkuRef(
  db: DB,
  partnerId: string,
  sku: string
): Promise<FirebaseFirestore.DocumentReference | null> {
  const col = db.collection(`partners/${partnerId}/products`);
  let snap = await col.where("cdonSku", "==", sku).limit(1).get();
  if (snap.empty) snap = await col.where("sku", "==", sku).limit(1).get();
  return snap.empty ? null : snap.docs[0].ref;
}

// Process one partner's CDON order queue. Exported for manual triggering.
export async function pollPartnerCdonOrders(
  db: DB,
  partnerId: string,
  config: CdonConfig
): Promise<{ orders: number; applied: number }> {
  const raw = await listOrders(config);
  let applied = 0;

  for (const rawOrder of raw) {
    const order = parseCdonOrder(rawOrder);
    if (!order) {
      console.warn(`[cdon-poll] ${partnerId}: unparseable order`, JSON.stringify(rawOrder).slice(0, 500));
      continue;
    }

    const docId = `cdon-${order.orderId}`;
    const ref = db.collection(`partners/${partnerId}/orders`).doc(docId);

    // Resolve article refs first — queries can't run inside the transaction.
    const rows: Array<{ ref: FirebaseFirestore.DocumentReference; quantity: number }> = [];
    for (const row of order.rows) {
      if (!row.sku || row.quantity <= 0) continue;
      const articleRef = await resolveSkuRef(db, partnerId, row.sku);
      if (!articleRef) {
        console.warn(`[cdon-poll] ${partnerId}: no CRM article for SKU ${row.sku}`);
        continue;
      }
      rows.push({ ref: articleRef, quantity: row.quantity });
    }

    // One transaction: the stockApplied check, the decrements and the order
    // doc commit atomically — a crash can no longer decrement stock without
    // setting the flag (double-decrement on the next poll) or vice versa, and
    // a concurrent poll/manual trigger contends instead of double-applying.
    const now = new Date().toISOString();
    const didApply = await db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists && existing.data()?.stockApplied === true) return false;

      const articleSnaps = await Promise.all(rows.map((r) => tx.get(r.ref)));

      tx.set(
        ref,
        {
          id: docId,
          source: "cdon",
          cdonOrderId: order.orderId,
          orderNumber: order.orderNumber ?? order.orderId,
          status: "paid",
          lineItems: order.rows.map((r: CdonParsedRow) => ({
            productTitle: r.title ?? r.sku ?? "CDON item",
            sku: r.sku ?? "",
            quantity: r.quantity,
            price: r.price ?? 0,
          })),
          totalPrice: order.total ?? 0,
          currency: order.currency ?? "SEK",
          ...(order.customerName && { customerName: order.customerName }),
          ...(order.customerEmail && { customerEmail: order.customerEmail }),
          stockApplied: true,
          createdAt: (existing.exists && existing.data()?.createdAt) || now,
          updatedAt: now,
        },
        { merge: true }
      );

      articleSnaps.forEach((snap, i) => {
        const current = (snap.data()?.stock as number | undefined) ?? 0;
        tx.update(rows[i].ref, {
          stock: Math.max(0, current - rows[i].quantity),
          updatedAt: now,
        });
      });
      return true;
    });
    if (didApply) applied++;

    // Acknowledge each row so CDON stops returning it as new.
    for (const row of order.rows) {
      if (!row.rowId) continue;
      try {
        await acceptOrderRow(config, row.rowId);
      } catch (err) {
        console.error(`[cdon-poll] ${partnerId}: accept row ${row.rowId} failed`, err);
      }
    }
  }

  return { orders: raw.length, applied };
}

/**
 * CDON has no webhooks, so poll the order queue hourly. New orders decrement
 * CRM stock (which the central trigger then propagates to Shopify) and are
 * recorded in /orders/ with source "cdon".
 */
export const pollCdonOrders = onSchedule(
  { schedule: "every 60 minutes", region: "europe-west1" },
  async () => {
    const db = getFirestore();
    const partners = await partnersWithCdon(db);
    for (const partnerId of partners) {
      const config = await loadCdonConfig(db, partnerId);
      if (!config) continue;
      try {
        const res = await pollPartnerCdonOrders(db, partnerId, config);
        console.log(`[cdon-poll] ${partnerId}: ${res.orders} order(s), ${res.applied} applied`);
      } catch (err) {
        console.error(`[cdon-poll] ${partnerId} failed:`, err);
      }
    }
  }
);

/** Manual "poll now" trigger for the CDON settings UI (superAdmin only). */
export const pollCdonOrdersNow = onCall<{ partnerId: string }>(
  { region: "europe-west1", invoker: "public" },
  async (request) => {
    await requireSuperAdmin(request, "poll CDON");
    const db = getFirestore();
    const { partnerId } = request.data;
    if (!partnerId) {
      throw new HttpsError("invalid-argument", "partnerId is required");
    }
    const config = await loadCdonConfig(db, partnerId);
    if (!config) {
      throw new HttpsError("not-found", "CDON integration not configured");
    }
    return pollPartnerCdonOrders(db, partnerId, config);
  }
);
