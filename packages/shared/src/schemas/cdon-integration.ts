import { Schema } from "effect";

/**
 * CDON Merchant API credentials, stored per partner at
 * `/partners/{partnerId}/integrations/cdon`.
 *
 * Auth is HTTP Basic with `merchantId:token` against
 * `https://merchants-api.cdon.com/api`. CDON has no webhooks, so orders are
 * polled on a schedule and stock is pushed when CRM stock changes.
 */
export const CdonIntegrationConfig = Schema.Struct({
  merchantId: Schema.String,
  token: Schema.String,
  /** Default market for prices/shipping, e.g. "SE". */
  market: Schema.optional(Schema.String),
  connectedAt: Schema.String,
});

export type CdonIntegrationConfig = typeof CdonIntegrationConfig.Type;
