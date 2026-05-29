import { describe, it, expect } from "vitest";
import {
  parseVerifikationAmount,
  detectCsvFormat,
  parseVerifikationCsv,
} from "./csv-import";

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

const HEADERS =
  "Datum,Verifikationsnummer,Eventuell hänvisning,Konto,Officelt kontonamn,Debet,Kredit";

function csv(...rows: string[]) {
  return [HEADERS, ...rows].join("\n");
}

// ---------------------------------------------------------------------------
// parseVerifikationAmount
// ---------------------------------------------------------------------------

describe("parseVerifikationAmount", () => {
  it('parses "25,000.00 kr" (comma = thousands separator)', () => {
    expect(parseVerifikationAmount("25,000.00 kr")).toBe(25000);
  });

  it('parses "100.00 kr" (no thousands separator)', () => {
    expect(parseVerifikationAmount("100.00 kr")).toBe(100);
  });

  it('parses "3,367.20 kr" (thousands + decimals)', () => {
    expect(parseVerifikationAmount("3,367.20 kr")).toBeCloseTo(3367.2);
  });

  it('parses "220,179.77 kr" (large amount)', () => {
    expect(parseVerifikationAmount("220,179.77 kr")).toBeCloseTo(220179.77);
  });

  it("returns 0 for empty string", () => {
    expect(parseVerifikationAmount("")).toBe(0);
  });

  it("returns 0 for whitespace-only string", () => {
    expect(parseVerifikationAmount("   ")).toBe(0);
  });

  it('handles uppercase " KR" suffix', () => {
    expect(parseVerifikationAmount("1,000.00 KR")).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// detectCsvFormat
// ---------------------------------------------------------------------------

describe("detectCsvFormat", () => {
  it("detects verifikation format from Verifikationsnummer header", () => {
    const text = csv("2025-10-20,1,Test,1930,Bankkonto,100.00 kr,");
    expect(detectCsvFormat(text)).toBe("verifikation");
  });

  it("detects internal CRM format from transactionType header", () => {
    const text =
      "date,description,transactionType,category,totalAmount,vatRate\n2024-01-15,Test,cost,office_supplies,100,25";
    expect(detectCsvFormat(text)).toBe("internal");
  });

  it("returns unknown for unrecognized headers", () => {
    expect(detectCsvFormat("Name,Value,Other\nfoo,bar,baz")).toBe("unknown");
  });

  it("strips UTF-8 BOM before checking headers", () => {
    const text = "\uFEFF" + HEADERS + "\n2025-10-20,1,Test,1930,Bank,100.00 kr,";
    expect(detectCsvFormat(text)).toBe("verifikation");
  });

  it("is case-insensitive for header detection", () => {
    const text = HEADERS.toUpperCase() + "\n";
    expect(detectCsvFormat(text)).toBe("verifikation");
  });
});

// ---------------------------------------------------------------------------
// parseVerifikationCsv
// ---------------------------------------------------------------------------

describe("parseVerifikationCsv", () => {
  describe("basic parsing", () => {
    it("parses a 2-line owner injection correctly", () => {
      const text = csv(
        '2025-10-20,1,Ägarinsättning,1930,Företagskonto,"25,000.00 kr",',
        ',1,Ägarinsättning,2893,Skulder till närstående,,"25,000.00 kr"'
      );
      const result = parseVerifikationCsv(text);

      expect(result.errors).toHaveLength(0);
      expect(result.entries).toHaveLength(1);

      const entry = result.entries[0];
      expect(entry.date).toBe("2025-10-20");
      expect(entry.description).toBe("Ägarinsättning");
      expect(entry.totalAmount).toBeCloseTo(25000);
      expect(entry.lines).toHaveLength(2);
    });

    it("propagates Datum from first row to continuation rows", () => {
      const text = csv(
        "2025-12-09,2,Test,6540,IT-tjänster,1000.00 kr,",
        ",2,Test,1930,Företagskonto,,1000.00 kr"
      );
      const result = parseVerifikationCsv(text);

      expect(result.errors).toHaveLength(0);
      expect(result.entries[0].date).toBe("2025-12-09");
    });

    it("groups multiple verifications into separate entries", () => {
      const text = csv(
        '2025-10-20,1,Ägarinsättning,1930,Företagskonto,"25,000.00 kr",',
        ',1,Ägarinsättning,2893,Skulder,,"25,000.00 kr"',
        "2025-12-09,2,IT-kostnad,6540,IT-tjänster,1000.00 kr,",
        ",2,IT-kostnad,1930,Företagskonto,,1000.00 kr"
      );
      const result = parseVerifikationCsv(text);

      expect(result.errors).toHaveLength(0);
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].description).toBe("Ägarinsättning");
      expect(result.entries[1].description).toBe("IT-kostnad");
    });
  });

  describe("amount and VAT parsing", () => {
    it("stores debit and credit amounts on the lines", () => {
      const text = csv(
        "2025-10-20,1,Test,6540,IT-tjänster,100.00 kr,",
        ",1,Test,1930,Företagskonto,,100.00 kr"
      );
      const result = parseVerifikationCsv(text);

      expect(result.entries[0].lines[0].debit).toBeCloseTo(100);
      expect(result.entries[0].lines[0].credit).toBe(0);
      expect(result.entries[0].lines[1].debit).toBe(0);
      expect(result.entries[0].lines[1].credit).toBeCloseTo(100);
    });

    it("parses 3-line cost entry with VAT (vatAmount and vatRate inferred)", () => {
      const text = csv(
        '2025-12-19,5,Visma abonnemang,6540,IT-tjänster,"3,367.20 kr",',
        ",5,Ingående moms Visma,2641,Debiterad ingående moms,841.80 kr,",
        ',5,Betalning Visma,1930,Företagskonto,,"4,209.00 kr"'
      );
      const result = parseVerifikationCsv(text);

      expect(result.errors).toHaveLength(0);
      const entry = result.entries[0];
      expect(entry.totalAmount).toBeCloseTo(4209);
      expect(entry.vatAmount).toBeCloseTo(841.8);
      expect(entry.vatRate).toBe("25");
    });

    it("calculates zero vatAmount for reverse-charge entries (2614 + 2645 cancel out)", () => {
      // Shopify EU subscription paid by owner via owner loan
      const text = csv(
        "2026-01-05,8,Shopify EU,6540,IT-tjänster,575.05 kr,",
        ',8,Utgående moms omvänd EU,2614,"Utgående moms omvänd skattskyldighet, 25 %",143.76 kr,',
        ",8,Ingående moms omvänd EU,2645,Beräknad ingående moms,,143.76 kr",
        ',8,Utlägg ägare,2893,"Skulder till närstående",,575.05 kr'
      );
      const result = parseVerifikationCsv(text);

      expect(result.errors).toHaveLength(0);
      const entry = result.entries[0];
      // totalAmount: no 1930 — uses largest non-VAT amount = 575.05
      expect(entry.totalAmount).toBeCloseTo(575.05);
      // net VAT: 143.76 debit - 143.76 credit = 0
      expect(entry.vatAmount).toBe(0);
      expect(entry.vatRate).toBe("0");
    });
  });

  describe("category inference", () => {
    it("infers it_services from account 6540 (exact match)", () => {
      const text = csv(
        "2025-12-19,5,Visma,6540,IT-tjänster,1000.00 kr,",
        ",5,Visma,1930,Företagskonto,,1000.00 kr"
      );
      const result = parseVerifikationCsv(text);
      expect(result.entries[0].category).toBe("it_services");
      expect(result.entries[0].transactionType).toBe("cost");
    });

    it("infers rent from account 5060 (2-digit prefix match on 5010)", () => {
      const text = csv(
        '2026-01-05,7,Postboxhyra,"5060","Hyra av lokal","3,240.00 kr",',
        ',7,Postboxhyra,2641,Ingående moms,810.00 kr,',
        ',7,Postboxhyra,1930,Företagskonto,,"4,050.00 kr"'
      );
      const result = parseVerifikationCsv(text);
      expect(result.entries[0].category).toBe("rent");
    });

    it("infers bank_fees from account 6570 (exact match)", () => {
      const text = csv(
        "2026-01-08,11,Bankavgift,6570,Bankkostnader,650.00 kr,",
        ",11,Bankavgift,1930,Företagskonto,,650.00 kr"
      );
      const result = parseVerifikationCsv(text);
      expect(result.entries[0].category).toBe("bank_fees");
    });

    it("infers owner_equity for 2893 account (2-digit + account class fallback)", () => {
      const text = csv(
        '2025-10-20,1,Ägarinsättning,1930,Företagskonto,"25,000.00 kr",',
        ',1,Ägarinsättning,2893,Skulder till närstående,,"25,000.00 kr"'
      );
      const result = parseVerifikationCsv(text);
      expect(result.entries[0].category).toBe("owner_equity");
      expect(result.entries[0].transactionType).toBe("income");
    });

    it("infers supplier_advance for 1684 account (balance sheet asset outflow)", () => {
      const text = csv(
        '2025-12-12,4,Förskott Kina,1684,Förskott till leverantörer,"75,125.83 kr",',
        ',4,Förskott Kina,1930,Företagskonto,,"75,125.83 kr"'
      );
      const result = parseVerifikationCsv(text);
      expect(result.entries[0].category).toBe("supplier_advance");
      expect(result.entries[0].transactionType).toBe("cost");
    });
  });

  describe("error handling", () => {
    it("returns an error when the first row of a verifikation has no Datum", () => {
      const text = csv(
        ",1,Ägarinsättning,1930,Företagskonto,25000.00 kr,",
        ",1,Ägarinsättning,2893,Skulder,,25000.00 kr"
      );
      const result = parseVerifikationCsv(text);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.entries).toHaveLength(0);
    });

    it("returns an error for malformed date", () => {
      const text = csv(
        "20-10-2025,1,Test,1930,Bank,100.00 kr,",
        ",1,Test,2893,Skulder,,100.00 kr"
      );
      const result = parseVerifikationCsv(text);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("returns an error for empty file (header only)", () => {
      const result = parseVerifikationCsv(HEADERS);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.entries).toHaveLength(0);
    });

    it("returns an error when required columns are missing", () => {
      const result = parseVerifikationCsv(
        "Datum,Konto,Debet\n2025-01-01,1930,100.00 kr"
      );
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatch(/Verifikationsnummer/);
    });
  });

  describe("warnings", () => {
    it("warns when a balance-sheet category is inferred (owner equity)", () => {
      const text = csv(
        '2025-10-20,1,Ägarinsättning,1930,Företagskonto,"25,000.00 kr",',
        ',1,Ägarinsättning,2893,Skulder,,"25,000.00 kr"'
      );
      const result = parseVerifikationCsv(text);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toMatch(/balance-sheet/i);
    });

    it("warns when a balance-sheet category is inferred (supplier advance)", () => {
      const text = csv(
        '2025-12-12,4,Förskott,1684,Förskott,"75,000.00 kr",',
        ',4,Förskott,1930,Företagskonto,,"75,000.00 kr"'
      );
      const result = parseVerifikationCsv(text);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
