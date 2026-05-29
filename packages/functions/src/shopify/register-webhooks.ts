import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { registerWebhooks } from "./register-webhooks-logic.js";

const WEBHOOK_PATH = "handleShopifyWebhook";
const REGION = "europe-west1";

interface RegisterShopifyWebhooksInput {
  partnerId: string;
}

export const registerShopifyWebhooks = onCall<RegisterShopifyWebhooksInput>(
  { region: REGION, invoker: "public" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const db = getFirestore();
    const callerEmail = request.auth.token.email;
    if (!callerEmail) {
      throw new HttpsError("unauthenticated", "Must be authenticated with email");
    }

    const allowedEmailSnap = await db.doc(`allowedEmails/${callerEmail}`).get();
    if (allowedEmailSnap.data()?.platformRole !== "superAdmin") {
      throw new HttpsError("permission-denied", "Only superAdmins can register webhooks");
    }

    const { partnerId } = request.data;
    if (!partnerId) {
      throw new HttpsError("invalid-argument", "partnerId is required");
    }

    const configSnap = await db.doc(`partners/${partnerId}/integrations/shopify`).get();
    if (!configSnap.exists) {
      throw new HttpsError("not-found", "Shopify integration not configured for this partner");
    }

    const config = configSnap.data() as { storeUrl: string; accessToken: string };
    const projectId = process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_CONFIG
      ? JSON.parse(process.env.FIREBASE_CONFIG!).projectId
      : "valter-crm";

    const webhookUrl = `https://${REGION}-${projectId}.cloudfunctions.net/${WEBHOOK_PATH}`;

    return registerWebhooks(config.storeUrl, config.accessToken, webhookUrl);
  }
);
