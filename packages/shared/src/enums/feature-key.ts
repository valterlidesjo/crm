export const FEATURE_KEYS = [
  "dashboard",
  "customers",
  "pipeline",
  "meetings",
  "invoicing",
  "quotes",
  "accounting",
  "inventory",
  "orders",
  "purchaseOrders",
  "settings",
  "profile",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  dashboard: "Dashboard",
  customers: "Customers",
  pipeline: "Pipeline",
  meetings: "Meetings",
  invoicing: "Invoicing",
  quotes: "Quotes",
  accounting: "Accounting",
  inventory: "Inventory",
  orders: "Orders",
  purchaseOrders: "Purchase Orders",
  settings: "Settings",
  profile: "Profile",
};

export const DEFAULT_FEATURES: Record<FeatureKey, boolean> = {
  dashboard: true,
  customers: true,
  pipeline: true,
  meetings: true,
  invoicing: true,
  quotes: true,
  accounting: true,
  inventory: true,
  orders: true,
  purchaseOrders: true,
  settings: true,
  profile: true,
};
