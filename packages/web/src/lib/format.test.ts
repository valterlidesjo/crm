import { describe, it, expect, beforeAll } from "vitest";
import i18n from "@/i18n/config";
import { formatCurrency, formatDate, getDaysRemaining } from "./format";

// These tests assert Swedish-locale output (kr, Swedish month names).
beforeAll(async () => {
  await i18n.changeLanguage("sv");
});

describe("formatCurrency", () => {
  it("should format SEK currency correctly", () => {
    const result = formatCurrency(50000);
    expect(result).toContain("50");
    expect(result).toContain("000");
    expect(result).toContain("kr");
  });

  it("should format zero correctly", () => {
    const result = formatCurrency(0);
    expect(result).toContain("0");
    expect(result).toContain("kr");
  });

  it("should use custom currency when provided", () => {
    const result = formatCurrency(1000, "EUR");
    expect(result).toContain("1");
    expect(result).toContain("000");
  });
});

describe("formatDate", () => {
  it("should format ISO date string to Swedish locale", () => {
    const result = formatDate("2026-12-31");
    expect(result).toContain("2026");
    expect(result).toContain("december");
    expect(result).toContain("31");
  });

  it("should handle different date formats", () => {
    const result = formatDate("2025-01-15");
    expect(result).toContain("2025");
    expect(result).toContain("januari");
    expect(result).toContain("15");
  });
});

describe("getDaysRemaining", () => {
  it("should return positive days for future dates", () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const result = getDaysRemaining(futureDate.toISOString().split("T")[0]);
    expect(result).toBe(10);
  });

  it("should return negative days for past dates", () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);
    const result = getDaysRemaining(pastDate.toISOString().split("T")[0]);
    expect(result).toBeLessThan(0);
  });

  it("should return 0 or 1 for today", () => {
    const today = new Date().toISOString().split("T")[0];
    const result = getDaysRemaining(today);
    expect(result).toBeLessThanOrEqual(1);
    expect(result).toBeGreaterThanOrEqual(0);
  });
});
