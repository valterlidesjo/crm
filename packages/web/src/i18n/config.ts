import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Namespace resources. One namespace per feature; add new feature namespaces here as
// they are migrated. English values mirror the original hardcoded strings; Swedish is
// the translation. Default UI language is Swedish, falling back to English.
import enCommon from "./locales/en/common.json";
import svCommon from "./locales/sv/common.json";
import enNav from "./locales/en/nav.json";
import svNav from "./locales/sv/nav.json";
import enDashboard from "./locales/en/dashboard.json";
import svDashboard from "./locales/sv/dashboard.json";
import enOrders from "./locales/en/orders.json";
import svOrders from "./locales/sv/orders.json";
import enSettings from "./locales/en/settings.json";
import svSettings from "./locales/sv/settings.json";
import enProfile from "./locales/en/profile.json";
import svProfile from "./locales/sv/profile.json";
import enPartners from "./locales/en/partners.json";
import svPartners from "./locales/sv/partners.json";
import enPipeline from "./locales/en/pipeline.json";
import svPipeline from "./locales/sv/pipeline.json";
import enMeetings from "./locales/en/meetings.json";
import svMeetings from "./locales/sv/meetings.json";
import enQuotes from "./locales/en/quotes.json";
import svQuotes from "./locales/sv/quotes.json";
import enCustomers from "./locales/en/customers.json";
import svCustomers from "./locales/sv/customers.json";
import enPurchaseOrders from "./locales/en/purchaseOrders.json";
import svPurchaseOrders from "./locales/sv/purchaseOrders.json";
import enInventory from "./locales/en/inventory.json";
import svInventory from "./locales/sv/inventory.json";
import enInvoices from "./locales/en/invoices.json";
import svInvoices from "./locales/sv/invoices.json";
import enAccounting from "./locales/en/accounting.json";
import svAccounting from "./locales/sv/accounting.json";
import enAuth from "./locales/en/auth.json";
import svAuth from "./locales/sv/auth.json";

export const LANGUAGE_STORAGE_KEY = "crm-language";
export const SUPPORTED_LANGUAGES = ["sv", "en"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = "sv";

export const resources = {
  en: {
    common: enCommon,
    nav: enNav,
    dashboard: enDashboard,
    orders: enOrders,
    settings: enSettings,
    profile: enProfile,
    partners: enPartners,
    pipeline: enPipeline,
    meetings: enMeetings,
    quotes: enQuotes,
    customers: enCustomers,
    purchaseOrders: enPurchaseOrders,
    inventory: enInventory,
    invoices: enInvoices,
    accounting: enAccounting,
    auth: enAuth,
  },
  sv: {
    common: svCommon,
    nav: svNav,
    dashboard: svDashboard,
    orders: svOrders,
    settings: svSettings,
    profile: svProfile,
    partners: svPartners,
    pipeline: svPipeline,
    meetings: svMeetings,
    quotes: svQuotes,
    customers: svCustomers,
    purchaseOrders: svPurchaseOrders,
    inventory: svInventory,
    invoices: svInvoices,
    accounting: svAccounting,
    auth: svAuth,
  },
} as const;

function initialLanguage(): Language {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === "en" || stored === "sv") return stored;
  } catch {
    // localStorage unavailable (SSR / restricted) — fall through to default
  }
  return DEFAULT_LANGUAGE;
}

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage(),
  fallbackLng: "en",
  defaultNS: "common",
  interpolation: {
    escapeValue: false, // React already escapes
  },
  returnNull: false,
});

export default i18n;
