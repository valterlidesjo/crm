export const WEBHOOK_TOPICS = [
  "orders/create",
  "orders/paid",
  "orders/cancelled",
  "orders/fulfilled",
  "refunds/create",
  "products/create",
  "products/update",
  "products/delete",
] as const;

export type WebhookTopic = (typeof WEBHOOK_TOPICS)[number];

export interface WebhookOpFailure {
  topic: string;
  op: "create" | "update";
  messages: string[];
}

export interface RegisterWebhooksResult {
  created: number;
  updated: number;
  topics: string[];
  failures: WebhookOpFailure[];
}

interface UserError {
  field?: string[] | null;
  message: string;
}

interface ExistingSubscription {
  id: string;
  topic: string;
  callbackUrl: string;
}

async function shopifyGraphQL(
  storeUrl: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown>,
  fetchFn: typeof fetch
): Promise<unknown> {
  const url = `https://${storeUrl}/admin/api/2025-01/graphql.json`;
  const res = await fetchFn(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  return (res as Response).json();
}

const LIST_WEBHOOKS_QUERY = `
  query ListWebhooks {
    webhookSubscriptions(first: 100) {
      edges {
        node {
          id
          topic
          callbackUrl
        }
      }
    }
  }
`;

const CREATE_WEBHOOK_MUTATION = `
  mutation CreateWebhook($topic: WebhookSubscriptionTopic!, $callbackUrl: URL!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: { callbackUrl: $callbackUrl, format: JSON }) {
      webhookSubscription { id topic }
      userErrors { field message }
    }
  }
`;

const UPDATE_WEBHOOK_MUTATION = `
  mutation UpdateWebhook($id: ID!, $callbackUrl: URL!) {
    webhookSubscriptionUpdate(id: $id, webhookSubscription: { callbackUrl: $callbackUrl }) {
      webhookSubscription { id topic }
      userErrors { field message }
    }
  }
`;

function topicToGqlEnum(topic: string): string {
  return topic.replace("/", "_").toUpperCase();
}

export interface ListedSubscription {
  id: string;
  topic: string;
  callbackUrl: string;
}

export async function listWebhooks(
  storeUrl: string,
  accessToken: string,
  fetchFn: typeof fetch = fetch
): Promise<ListedSubscription[]> {
  const res = (await shopifyGraphQL(
    storeUrl,
    accessToken,
    LIST_WEBHOOKS_QUERY,
    {},
    fetchFn
  )) as {
    data: { webhookSubscriptions: { edges: Array<{ node: ExistingSubscription }> } };
  };
  return res.data.webhookSubscriptions.edges.map(({ node }) => ({
    id: node.id,
    topic: node.topic.toLowerCase().replace("_", "/"),
    callbackUrl: node.callbackUrl,
  }));
}

export async function registerWebhooks(
  storeUrl: string,
  accessToken: string,
  webhookUrl: string,
  fetchFn: typeof fetch = fetch
): Promise<RegisterWebhooksResult> {
  const listRes = (await shopifyGraphQL(storeUrl, accessToken, LIST_WEBHOOKS_QUERY, {}, fetchFn)) as {
    data: { webhookSubscriptions: { edges: Array<{ node: ExistingSubscription }> } };
  };

  // GraphQL returns topics as enum (ORDERS_PAID), normalize to REST format (orders/paid) for lookup
  const existing = new Map<string, string>(
    listRes.data.webhookSubscriptions.edges.map(({ node }) => [
      node.topic.toLowerCase().replace("_", "/"),
      node.id,
    ])
  );

  let created = 0;
  let updated = 0;
  const failures: WebhookOpFailure[] = [];

  for (const topic of WEBHOOK_TOPICS) {
    const existingId = existing.get(topic);
    if (existingId) {
      const res = (await shopifyGraphQL(
        storeUrl,
        accessToken,
        UPDATE_WEBHOOK_MUTATION,
        { id: existingId, callbackUrl: webhookUrl },
        fetchFn
      )) as {
        data?: { webhookSubscriptionUpdate?: { userErrors?: UserError[] } };
      };
      const errs = res.data?.webhookSubscriptionUpdate?.userErrors ?? [];
      if (errs.length) {
        failures.push({ topic, op: "update", messages: errs.map((e) => e.message) });
      } else {
        updated++;
      }
    } else {
      const res = (await shopifyGraphQL(
        storeUrl,
        accessToken,
        CREATE_WEBHOOK_MUTATION,
        { topic: topicToGqlEnum(topic), callbackUrl: webhookUrl },
        fetchFn
      )) as {
        data?: { webhookSubscriptionCreate?: { userErrors?: UserError[] } };
      };
      const errs = res.data?.webhookSubscriptionCreate?.userErrors ?? [];
      if (errs.length) {
        failures.push({ topic, op: "create", messages: errs.map((e) => e.message) });
      } else {
        created++;
      }
    }
  }

  return { created, updated, topics: [...WEBHOOK_TOPICS], failures };
}
