import "@testing-library/jest-dom/vitest";
import i18n from "@/i18n/config";

// Component tests assert English UI strings, so run them with English as the active
// language. Tests that need a different language can call i18n.changeLanguage locally.
void i18n.changeLanguage("en");

// Polyfill ResizeObserver for Radix UI components in jsdom
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
