import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import {
  listWebhooks,
  WEBHOOK_TOPICS,
  type ListedSubscription,
} from "./register-webhooks-logic.js";
import { requireSuperAdmin } from "../lib/require-super-admin.js";

const WEBHOOK_PATH = "handleShopifyWebhook";
const REGION = "europe-west1";

interface ListShopifyWebhooksInput {
  partnerId: string;
}

interface WebhookStatus {
  topic: string;
  status: "correct" | "wrong-url" | "missing";
  callbackUrl?: string;
}

interface ListShopifyWebhooksResult {
  expectedUrl: string;
  subscriptions: ListedSubscription[];
  byTopic: WebhookStatus[];
}

export const listShopifyWebhooks = onCall<ListShopifyWebhooksInput>(
  { region: REGION, invoker: "public" },
  async (request): Promise<ListShopifyWebhooksResult> => {
    await requireSuperAdmin(request, "list webhooks");

    const db = getFirestore();

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
    const expectedUrl = `https://${REGION}-${projectId}.cloudfunctions.net/${WEBHOOK_PATH}`;

    const subscriptions = await listWebhooks(config.storeUrl, config.accessToken);

    const byTopic: WebhookStatus[] = WEBHOOK_TOPICS.map((topic) => {
      const match = subscriptions.find((s) => s.topic === topic);
      if (!match) return { topic, status: "missing" };
      if (match.callbackUrl !== expectedUrl) {
        return { topic, status: "wrong-url", callbackUrl: match.callbackUrl };
      }
      return { topic, status: "correct", callbackUrl: match.callbackUrl };
    });

    return { expectedUrl, subscriptions, byTopic };
  }
);
