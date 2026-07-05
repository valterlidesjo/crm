import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import * as crypto from "crypto";
import {
  handleOrderCreate,
  handleOrderPaid,
  handleOrderCancelled,
  handleOrderFulfilled,
  handleRefundCreate,
  handleProductCreate,
  handleProductDelete,
  handleProductUpdate,
  type ShopifyOrderPayload,
  type ShopifyRefundPayload,
  type ShopifyProductPayload,
} from "./webhook-topics";

function verifyWebhookHmac(
  rawBody: Buffer,
  hmacHeader: string,
  secret: string
): boolean {
  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");
  const expected = Buffer.from(digest);
  const received = Buffer.from(hmacHeader);
  // timingSafeEqual throws on length mismatch — an attacker-controlled header
  // must yield a clean 401, not an unhandled 500.
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(expected, received);
}

// Find partner by Shopify store URL using the webhook's shop domain header
async function findPartnerByDomain(
  db: FirebaseFirestore.Firestore,
  shopDomain: string
) {
  const snap = await db
    .collectionGroup("integrations")
    .where("storeUrl", "==", shopDomain)
    .limit(1)
    .get();

  if (snap.empty) return null;

  // Extract partnerId from path: partners/{partnerId}/integrations/shopify
  const pathParts = snap.docs[0].ref.path.split("/");
  const partnerId = pathParts[1];
  const config = snap.docs[0].data() as {
    webhookSecret: string;
  };
  return { partnerId, webhookSecret: config.webhookSecret };
}

export const handleShopifyWebhook = onRequest(
  { region: "europe-west1", invoker: "public" },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    const hmacHeader = req.headers["x-shopify-hmac-sha256"] as string;
    const topic = req.headers["x-shopify-topic"] as string;
    const shopDomain = req.headers["x-shopify-shop-domain"] as string;

    if (!hmacHeader || !topic || !shopDomain) {
      res.status(400).send("Missing required headers");
      return;
    }

    const db = getFirestore();
    const partnerInfo = await findPartnerByDomain(db, shopDomain);

    if (!partnerInfo) {
      // Unknown shop — still return 200 to avoid Shopify retries, but log it:
      // if storeUrl in Firestore ever diverges from the shop-domain header,
      // every webhook is dropped here and this is the only signal.
      console.error(`[shopify-webhook] no partner for shop domain ${shopDomain} — dropping ${topic}`);
      res.status(200).send("ok");
      return;
    }

    if (!partnerInfo.webhookSecret) {
      // Config error: integration doc without a webhook secret. Return 200 so
      // Shopify doesn't drop the subscription over repeated failures.
      console.error(`[shopify-webhook] ${partnerInfo.partnerId}: webhookSecret missing — cannot verify, dropping ${topic}`);
      res.status(200).send("ok");
      return;
    }

    // Verify HMAC signature
    const rawBody: Buffer = req.rawBody as Buffer;
    const isValid = verifyWebhookHmac(
      rawBody,
      hmacHeader,
      partnerInfo.webhookSecret
    );

    if (!isValid) {
      res.status(401).send("Invalid signature");
      return;
    }

    // Process BEFORE responding. Cloud Functions v2 (Cloud Run) throttles CPU
    // once the response is sent, so post-response work can be silently killed —
    // and Shopify never retries a 200. The handlers are a handful of Firestore
    // ops and finish well within Shopify's 5s response window. On failure we
    // return 500 so Shopify retries; every handler is idempotent.
    const { partnerId } = partnerInfo;
    const body = req.body;

    try {
      if (topic === "orders/create") {
        await handleOrderCreate(db, partnerId, body as ShopifyOrderPayload);
      } else if (topic === "orders/paid") {
        await handleOrderPaid(db, partnerId, body as ShopifyOrderPayload);
      } else if (topic === "orders/cancelled") {
        await handleOrderCancelled(db, partnerId, body as ShopifyOrderPayload);
      } else if (topic === "orders/fulfilled") {
        await handleOrderFulfilled(db, partnerId, body as ShopifyOrderPayload);
      } else if (topic === "refunds/create") {
        await handleRefundCreate(db, partnerId, body as ShopifyRefundPayload);
      } else if (topic === "products/create") {
        await handleProductCreate(db, partnerId, body as ShopifyProductPayload);
      } else if (topic === "products/update") {
        await handleProductUpdate(db, partnerId, body as ShopifyProductPayload);
      } else if (topic === "products/delete") {
        await handleProductDelete(db, partnerId, body as ShopifyProductPayload);
      }
    } catch (err) {
      console.error(`Error processing webhook topic=${topic}:`, err);
      res.status(500).send("processing failed");
      return;
    }

    res.status(200).send("ok");
  }
);
