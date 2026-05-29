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

type DB = ReturnType<typeof getFirestore>;

// Decrement a CRM article's stock by SKU (matches cdonSku, then sku).
// Returns true if an article was found and updated.
async function decrementBySku(
  db: DB,
  partnerId: string,
  sku: string,
  quantity: number
): Promise<boolean> {
  const col = db.collection(`partners/${partnerId}/products`);
  let snap = await col.where("cdonSku", "==", sku).limit(1).get();
  if (snap.empty) snap = await col.where("sku", "==", sku).limit(1).get();
  if (snap.empty) return false;

  const ref = snap.docs[0].ref;
  const current = (snap.docs[0].data().stock as number) ?? 0;
  await ref.update({
    stock: Math.max(0, current - quantity),
    updatedAt: new Date().toISOString(),
  });
  return true;
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
    const existing = await ref.get();
    const alreadyApplied = existing.exists && existing.data()?.stockApplied === true;

    if (!alreadyApplied) {
      for (const row of order.rows) {
        if (!row.sku || row.quantity <= 0) continue;
        const ok = await decrementBySku(db, partnerId, row.sku, row.quantity);
        if (!ok) {
          console.warn(`[cdon-poll] ${partnerId}: no CRM article for SKU ${row.sku}`);
        }
      }

      const now = new Date().toISOString();
      await ref.set(
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
          createdAt: existing.data()?.createdAt ?? now,
          updatedAt: now,
        },
        { merge: true }
      );
      applied++;
    }

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
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }
    const db = getFirestore();
    const callerEmail = request.auth.token.email;
    const allowed = callerEmail
      ? await db.doc(`allowedEmails/${callerEmail}`).get()
      : null;
    if (allowed?.data()?.platformRole !== "superAdmin") {
      throw new HttpsError("permission-denied", "Only superAdmins can poll CDON");
    }
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
