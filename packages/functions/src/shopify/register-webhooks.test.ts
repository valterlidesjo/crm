import { describe, it, expect, vi } from "vitest";
import { registerWebhooks } from "./register-webhooks-logic";

const STORE_URL = "test-store.myshopify.com";
const ACCESS_TOKEN = "shpat_test123";
const WEBHOOK_URL = "https://europe-west1-valter-crm.cloudfunctions.net/handleShopifyWebhook";

const ALL_TOPICS = [
  "orders/create",
  "orders/paid",
  "orders/cancelled",
  "orders/fulfilled",
  "refunds/create",
  "products/create",
  "products/update",
  "products/delete",
];

function makeListResponse(topics: string[]) {
  return {
    data: {
      webhookSubscriptions: {
        edges: topics.map((topic, i) => ({
          node: { id: `gid://shopify/WebhookSubscription/${i + 1}`, topic, callbackUrl: WEBHOOK_URL },
        })),
      },
    },
  };
}

function makeCreateResponse(topic: string) {
  return {
    data: {
      webhookSubscriptionCreate: {
        webhookSubscription: { id: "gid://shopify/WebhookSubscription/999", topic },
        userErrors: [],
      },
    },
  };
}

function makeUpdateResponse(topic: string) {
  return {
    data: {
      webhookSubscriptionUpdate: {
        webhookSubscription: { id: "gid://shopify/WebhookSubscription/1", topic },
        userErrors: [],
      },
    },
  };
}

describe("registerWebhooks", () => {
  it("creates subscriptions for all 8 topics when none exist", async () => {
    const fetchFn = vi.fn().mockImplementation(async (_url: string, opts: RequestInit) => {
      const body = JSON.parse(opts.body as string);
      if (body.query.includes("webhookSubscriptions")) {
        return { json: async () => makeListResponse([]) };
      }
      const topicMatch = body.variables?.topic as string;
      return { json: async () => makeCreateResponse(topicMatch) };
    });

    const result = await registerWebhooks(STORE_URL, ACCESS_TOKEN, WEBHOOK_URL, fetchFn as typeof fetch);

    // Should have called list once, then create for each topic
    const createCalls = fetchFn.mock.calls.filter(([, opts]) => {
      const body = JSON.parse((opts as RequestInit).body as string);
      return body.query.includes("webhookSubscriptionCreate");
    });
    expect(createCalls).toHaveLength(8);
    expect(result.created).toBe(8);
    expect(result.updated).toBe(0);
  });

  it("updates existing subscriptions instead of creating duplicates", async () => {
    const existingTopics = ["orders/create", "orders/paid"];

    const fetchFn = vi.fn().mockImplementation(async (_url: string, opts: RequestInit) => {
      const body = JSON.parse(opts.body as string);
      if (body.query.includes("webhookSubscriptions")) {
        return { json: async () => makeListResponse(existingTopics) };
      }
      if (body.query.includes("webhookSubscriptionUpdate")) {
        return { json: async () => makeUpdateResponse(body.variables?.topic ?? "") };
      }
      const topicMatch = body.variables?.topic as string;
      return { json: async () => makeCreateResponse(topicMatch) };
    });

    const result = await registerWebhooks(STORE_URL, ACCESS_TOKEN, WEBHOOK_URL, fetchFn as typeof fetch);

    const updateCalls = fetchFn.mock.calls.filter(([, opts]) => {
      const body = JSON.parse((opts as RequestInit).body as string);
      return body.query.includes("webhookSubscriptionUpdate");
    });
    const createCalls = fetchFn.mock.calls.filter(([, opts]) => {
      const body = JSON.parse((opts as RequestInit).body as string);
      return body.query.includes("webhookSubscriptionCreate");
    });

    expect(updateCalls).toHaveLength(2);
    expect(createCalls).toHaveLength(6);
    expect(result.created).toBe(6);
    expect(result.updated).toBe(2);
  });

  it("returns the list of registered topics", async () => {
    const fetchFn = vi.fn().mockImplementation(async (_url: string, opts: RequestInit) => {
      const body = JSON.parse(opts.body as string);
      if (body.query.includes("webhookSubscriptions")) {
        return { json: async () => makeListResponse([]) };
      }
      const topicMatch = body.variables?.topic as string;
      return { json: async () => makeCreateResponse(topicMatch) };
    });

    const result = await registerWebhooks(STORE_URL, ACCESS_TOKEN, WEBHOOK_URL, fetchFn as typeof fetch);

    expect(result.topics).toEqual(expect.arrayContaining(ALL_TOPICS));
    expect(result.topics).toHaveLength(8);
  });
});
