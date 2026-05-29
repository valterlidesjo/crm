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

async function verifyWebhookHmac(
  rawBody: Buffer,
  hmacHeader: string,
  secret: string
): Promise<boolean> {
  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");
  return crypto.timingSafeEqual(
    Buffer.from(digest),
    Buffer.from(hmacHeader)
  );
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
  { region: "europe-west1" },
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
      // Unknown shop — still return 200 to avoid Shopify retries
      res.status(200).send("ok");
      return;
    }

    // Verify HMAC signature
    const rawBody: Buffer = req.rawBody as Buffer;
    const isValid = await verifyWebhookHmac(
      rawBody,
      hmacHeader,
      partnerInfo.webhookSecret
    );

    if (!isValid) {
      res.status(401).send("Invalid signature");
      return;
    }

    // Respond immediately — Shopify requires response within 5s
    res.status(200).send("ok");

    // Process async after response
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
    }
  }
);
