import { ACCOUNT_CATEGORIES } from "@crm/shared";
import { buildJournalEntry } from "./journal-entry-builder";
import i18n from "@/i18n";
import type { JournalEntry, VatRate } from "@crm/shared";

const t = () => i18n.getFixedT(null, "accounting");

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/** A parsed entry ready for preview/import (no persisted metadata yet). */
export type ParsedImportEntry = Omit<
  JournalEntry,
  "id" | "createdAt" | "updatedAt"
>;

export interface ImportEntriesResult {
  entries: ParsedImportEntry[];
  errors: string[];
  warnings: string[];
}

const VALID_VAT_RATES = new Set<string>(["0", "6", "12", "25"]);

/**
 * Parses an amount typed by a user / exported from Excel, tolerating the
 * common Swedish and English variations:
 *   "1250.00"      → 1250
 *   "1 250,50"     → 1250.5   (space thousands, comma decimal)
 *   "1 250,50 kr"  → 1250.5
 *   "1,250.00"     → 1250     (comma thousands, dot decimal)
 *   "1.250.000"    → 1250000  (dot thousands)
 */
export function parseFlexibleAmount(raw: string): number {
  let s = raw
    .trim()
    .replace(/\s*kr\s*$/i, "") // strip currency suffix
    .replace(/\s/g, ""); // strip thousands spaces

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // Whichever separator appears last is the decimal one.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", "."); // comma decimal
    } else {
      s = s.replace(/,/g, ""); // dot decimal, comma thousands
    }
  } else if (hasComma) {
    // Single comma → decimal; multiple → thousands separators.
    s = (s.match(/,/g) ?? []).length > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (hasDot && (s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, ""); // multiple dots → thousands separators
  }

  return parseFloat(s);
}

export function parseEntriesCsv(csvText: string): ImportEntriesResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const entries: ParsedImportEntry[] = [];

  const lines = csvText
    .replace(/^\uFEFF/, "") // strip BOM
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    errors.push(t()("import.errors.emptyInternal"));
    return { entries, errors, warnings };
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());

  function col(name: string): number {
    return headers.indexOf(name);
  }

  const dateIdx = col("date");
  const descIdx = col("description");
  const typeIdx = col("transactiontype");
  const catIdx = col("category");
  const amtIdx = col("totalamount");
  const vatRateIdx = col("vatrate");

  const missing: string[] = [];
  if (dateIdx === -1) missing.push("date");
  if (typeIdx === -1) missing.push("transactionType");
  if (catIdx === -1) missing.push("category");
  if (amtIdx === -1) missing.push("totalAmount");

  if (missing.length > 0) {
    errors.push(t()("import.errors.missingColumns", { columns: missing.join(", ") }));
    return { entries, errors, warnings };
  }

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const rowNum = i + 1;

    const date = row[dateIdx] ?? "";
    const description = descIdx !== -1 ? (row[descIdx] ?? "") : "";
    const transactionType = (row[typeIdx] ?? "").toLowerCase();
    const categoryId = row[catIdx] ?? "";
    const totalAmountStr = row[amtIdx] ?? "";
    const vatRateStr = vatRateIdx !== -1 ? (row[vatRateIdx] ?? "").trim() : "";

    // Validate date
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push(
        t()("import.errors.invalidDate", { row: rowNum, date })
      );
      continue;
    }

    // Validate transactionType
    if (transactionType !== "cost" && transactionType !== "income") {
      errors.push(
        t()("import.errors.invalidTransactionType", {
          row: rowNum,
          type: transactionType,
        })
      );
      continue;
    }

    // Validate category
    const category = ACCOUNT_CATEGORIES.find((c) => c.id === categoryId);
    if (!category) {
      errors.push(
        t()("import.errors.unknownCategory", { row: rowNum, category: categoryId })
      );
      continue;
    }

    if (category.transactionType !== transactionType) {
      errors.push(
        t()("import.errors.categoryTypeMismatch", {
          row: rowNum,
          category: categoryId,
          categoryType: category.transactionType,
          type: transactionType,
        })
      );
      continue;
    }

    // Validate amount
    const totalAmount = parseFlexibleAmount(totalAmountStr);
    if (isNaN(totalAmount) || totalAmount <= 0) {
      errors.push(
        t()("import.errors.invalidAmount", { row: rowNum, amount: totalAmountStr })
      );
      continue;
    }

    // VAT rate (optional — defaults to category default)
    let vatRate: VatRate = category.defaultVatRate;
    if (vatRateStr !== "") {
      if (VALID_VAT_RATES.has(vatRateStr)) {
        vatRate = vatRateStr as VatRate;
      } else {
        warnings.push(
          t()("import.warnings.invalidVatRate", {
            row: rowNum,
            rate: vatRateStr,
            defaultRate: category.defaultVatRate,
          })
        );
      }
    }

    const entry = buildJournalEntry({
      category,
      totalAmount,
      date,
      description: description || category.name,
      vatRate,
    });

    entries.push(entry);
  }

  return { entries, errors, warnings };
}

// ---------------------------------------------------------------------------
// Verifikationsjournal format support
// ---------------------------------------------------------------------------

// VAT accounts (2610–2649): utgående moms + ingående moms
const VAT_ACCOUNT_RE = /^26[0-4]/;
// Bank/payment accounts (petty cash + bank accounts)
const BANK_ACCOUNTS = new Set(["1920", "1930", "1940"]);

const isVatAccount = (n: string) => VAT_ACCOUNT_RE.test(n);
const isBankAccount = (n: string) => BANK_ACCOUNTS.has(n);
const isAuxiliaryAccount = (n: string) => isVatAccount(n) || isBankAccount(n);

// Balance-sheet fallback category IDs — imports to these trigger a warning
const BALANCE_SHEET_CATEGORY_IDS = new Set([
  "supplier_advance",
  "deposit",
  "owner_equity",
]);

/**
 * Detects whether a CSV text is in the verifikation (Swedish bookkeeping export)
 * format or the CRM internal format, based on the header row.
 */
export function detectCsvFormat(
  csvText: string
): "verifikation" | "internal" | "unknown" {
  const firstLine = csvText
    .replace(/^\uFEFF/, "")
    .split("\n")[0]
    ?.toLowerCase()
    .trim();

  if (!firstLine) return "unknown";
  if (firstLine.includes("verifikationsnummer")) return "verifikation";
  if (firstLine.includes("transactiontype")) return "internal";
  return "unknown";
}

/**
 * Parses a Swedish bookkeeping amount string to a number.
 *
 * Handles the format used in verifikationsjournaler:
 *   "25,000.00 kr" → 25000
 *   "3,367.20 kr"  → 3367.20
 *   "100.00 kr"    → 100
 *   ""             → 0
 *
 * Comma is the thousands separator, period is the decimal separator.
 * The " kr" currency suffix is stripped.
 */
export function parseVerifikationAmount(s: string): number {
  const cleaned = s
    .trim()
    .replace(/\s*kr\s*$/i, "") // strip " kr" suffix
    .trim()
    .replace(/,/g, ""); // remove thousands-separator commas
  const value = parseFloat(cleaned);
  return isNaN(value) ? 0 : value;
}

/** Find a category by ID, falling back to other_cost if not found. */
function findCat(id: string): (typeof ACCOUNT_CATEGORIES)[number] {
  return (
    ACCOUNT_CATEGORIES.find((c) => c.id === id) ??
    ACCOUNT_CATEGORIES.find((c) => c.id === "other_cost")!
  );
}

/**
 * Infers the most appropriate category and transactionType for a verifikation
 * by inspecting its constituent accounting lines.
 *
 * Priority:
 *  1. Exact account number match against a category's defaultAccountNumber
 *  2. Two-digit account prefix match (e.g. 50xx → rent via 5010)
 *  3. Account class (first digit) fallback
 */
function inferCategoryAndType(lines: { accountNumber: string; debit: number; credit: number }[]): {
  category: (typeof ACCOUNT_CATEGORIES)[number];
  transactionType: "cost" | "income";
} {
  const bankDebit = lines
    .filter((l) => isBankAccount(l.accountNumber))
    .reduce((s, l) => s + l.debit, 0);
  const bankCredit = lines
    .filter((l) => isBankAccount(l.accountNumber))
    .reduce((s, l) => s + l.credit, 0);

  // Find the primary account: non-bank, non-VAT, largest absolute amount
  const mainLine = lines
    .filter((l) => !isAuxiliaryAccount(l.accountNumber))
    .reduce<{ accountNumber: string; debit: number; credit: number } | null>(
      (best, l) => {
        const amt = Math.max(l.debit, l.credit);
        const bestAmt = best ? Math.max(best.debit, best.credit) : 0;
        return amt > bestAmt ? l : best;
      },
      null
    );

  if (!mainLine) {
    const isIncoming = bankDebit > bankCredit;
    return {
      category: findCat(isIncoming ? "other_income" : "other_cost"),
      transactionType: isIncoming ? "income" : "cost",
    };
  }

  // 1. Exact match
  const exact = ACCOUNT_CATEGORIES.find(
    (c) => c.defaultAccountNumber === mainLine.accountNumber
  );
  if (exact) return { category: exact, transactionType: exact.transactionType };

  // 2. Two-digit prefix match (e.g. account 5060 → prefix "50" → rent with 5010)
  const prefix2 = mainLine.accountNumber.slice(0, 2);
  const prefix2Match = ACCOUNT_CATEGORIES.find((c) =>
    c.defaultAccountNumber.startsWith(prefix2)
  );
  if (prefix2Match)
    return {
      category: prefix2Match,
      transactionType: prefix2Match.transactionType,
    };

  // 3. Account class fallback
  const firstDigit = mainLine.accountNumber[0];
  switch (firstDigit) {
    case "3":
      return { category: findCat("service_sales_25"), transactionType: "income" };
    case "4":
      return { category: findCat("goods_purchase"), transactionType: "cost" };
    case "5":
      return { category: findCat("rent"), transactionType: "cost" };
    case "6":
    case "7":
      return { category: findCat("other_cost"), transactionType: "cost" };
    case "8":
      return { category: findCat("other_income"), transactionType: "income" };
    case "1": {
      // Balance sheet asset — direction from bank
      const isOutflow = bankCredit > 0;
      return {
        category: findCat(isOutflow ? "supplier_advance" : "other_income"),
        transactionType: isOutflow ? "cost" : "income",
      };
    }
    case "2": {
      // Equity/liability — direction from bank
      const isInflow = bankDebit > 0;
      return {
        category: findCat(isInflow ? "owner_equity" : "other_cost"),
        transactionType: isInflow ? "income" : "cost",
      };
    }
    default:
      return { category: findCat("other_cost"), transactionType: "cost" };
  }
}

/**
 * Parses a CSV in the verifikationsjournal format exported by Swedish bookkeeping
 * software (Visma, Fortnox, etc.) into CRM journal entries.
 *
 * Format structure:
 *   Datum,Verifikationsnummer,Eventuell hänvisning,Konto,Officelt kontonamn,Debet,Kredit
 *
 * Each verifikation spans one or more rows. Only the first row has Datum populated;
 * continuation rows carry the same date and reference implicitly.
 */
export function parseVerifikationCsv(csvText: string): ImportEntriesResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const entries: ParsedImportEntry[] = [];

  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    errors.push(t()("import.errors.emptyVerifikation"));
    return { entries, errors, warnings };
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
  const col = (name: string) => headers.indexOf(name);

  const datumIdx = col("datum");
  const verifIdx = col("verifikationsnummer");
  // Handle slight spelling variations of the reference column
  const refIdx =
    col("eventuell hänvisning") !== -1
      ? col("eventuell hänvisning")
      : headers.findIndex((h) => h.includes("eventuell"));
  const kontoIdx = col("konto");
  const kontoNameIdx = headers.findIndex((h) => h.includes("kontonamn"));
  const debetIdx = col("debet");
  const kreditIdx = col("kredit");

  const missing: string[] = [];
  if (datumIdx === -1) missing.push("Datum");
  if (verifIdx === -1) missing.push("Verifikationsnummer");
  if (kontoIdx === -1) missing.push("Konto");
  if (debetIdx === -1) missing.push("Debet");
  if (kreditIdx === -1) missing.push("Kredit");

  if (missing.length > 0) {
    errors.push(t()("import.errors.missingColumns", { columns: missing.join(", ") }));
    return { entries, errors, warnings };
  }

  interface RawVerifLine {
    accountNumber: string;
    accountName: string;
    debit: number;
    credit: number;
  }

  interface VerifGroup {
    verifId: string;
    datum: string;
    ref: string;
    rawLines: RawVerifLine[];
    firstRowNum: number;
  }

  const groups = new Map<string, VerifGroup>();
  // Carry date/ref across continuation rows (blank Datum = same verif)
  let currentDatum = "";
  let currentRef = "";

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const rowNum = i + 1;

    const rawDatum = (row[datumIdx] ?? "").trim();
    const rawVerif = (row[verifIdx] ?? "").trim();
    const rawRef = refIdx !== -1 ? (row[refIdx] ?? "").trim() : "";
    const accountNumber = (row[kontoIdx] ?? "").trim();
    const accountName =
      kontoNameIdx !== -1 ? (row[kontoNameIdx] ?? "").trim() : accountNumber;
    const debetStr = row[debetIdx] ?? "";
    const kreditStr = row[kreditIdx] ?? "";

    if (!rawVerif) {
      warnings.push(t()("import.warnings.missingVerifNumber", { row: rowNum }));
      continue;
    }

    if (!accountNumber) {
      warnings.push(t()("import.warnings.missingAccountNumber", { row: rowNum }));
      continue;
    }

    // Validate and propagate date
    if (rawDatum) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDatum)) {
        errors.push(
          t()("import.errors.invalidDate", { row: rowNum, date: rawDatum })
        );
        continue;
      }
      currentDatum = rawDatum;
    }
    if (rawRef) currentRef = rawRef;

    // First row of a new verif must have a date
    if (!groups.has(rawVerif) && !rawDatum && !currentDatum) {
      errors.push(
        t()("import.errors.noDateFirstRow", { row: rowNum, verifId: rawVerif })
      );
      continue;
    }

    const debit = parseVerifikationAmount(debetStr);
    const credit = parseVerifikationAmount(kreditStr);

    if (!groups.has(rawVerif)) {
      groups.set(rawVerif, {
        verifId: rawVerif,
        datum: currentDatum,
        ref: rawRef || currentRef,
        rawLines: [],
        firstRowNum: rowNum,
      });
    }

    groups.get(rawVerif)!.rawLines.push({
      accountNumber,
      accountName,
      debit,
      credit,
    });
  }

  // Convert each group into a JournalEntry
  for (const [verifId, group] of groups) {
    if (group.rawLines.length === 0) continue;

    if (!group.datum) {
      errors.push(t()("import.errors.missingDate", { verifId }));
      continue;
    }

    const entryLines = group.rawLines.map((l) => ({
      accountNumber: l.accountNumber,
      accountName: l.accountName,
      debit: l.debit,
      credit: l.credit,
    }));

    // totalAmount: amount flowing through bank account (1930/1920/1940)
    // If no bank account present, use sum of non-VAT debits or credits
    const bankLines = entryLines.filter((l) => isBankAccount(l.accountNumber));
    const bankDebit = bankLines.reduce((s, l) => s + l.debit, 0);
    const bankCredit = bankLines.reduce((s, l) => s + l.credit, 0);

    let totalAmount: number;
    if (bankCredit > 0) {
      totalAmount = bankCredit; // money going out (cost)
    } else if (bankDebit > 0) {
      totalAmount = bankDebit; // money coming in (income)
    } else {
      // No bank account (e.g. owner-paid expense recorded as owner loan)
      const nonVatLines = entryLines.filter(
        (l) => !isVatAccount(l.accountNumber)
      );
      const nonVatDebit = nonVatLines.reduce((s, l) => s + l.debit, 0);
      const nonVatCredit = nonVatLines.reduce((s, l) => s + l.credit, 0);
      totalAmount = Math.max(nonVatDebit, nonVatCredit);
    }

    // vatAmount: net debit on VAT accounts
    // For reverse-charge entries, the debit and credit VAT lines cancel out → 0
    const netVat = entryLines
      .filter((l) => isVatAccount(l.accountNumber))
      .reduce((s, l) => s + l.debit - l.credit, 0);
    const vatAmount = Math.max(0, netVat);

    // Infer vatRate from ratio
    let vatRate: VatRate = "0";
    const baseAmount = totalAmount - vatAmount;
    if (baseAmount > 0 && vatAmount > 0) {
      const rate = Math.round((vatAmount / baseAmount) * 100);
      if (rate >= 23 && rate <= 27) vatRate = "25";
      else if (rate >= 10 && rate <= 14) vatRate = "12";
      else if (rate >= 4 && rate <= 8) vatRate = "6";
    }

    const { category, transactionType } = inferCategoryAndType(entryLines);

    if (BALANCE_SHEET_CATEGORY_IDS.has(category.id)) {
      warnings.push(
        t()("import.warnings.balanceSheetCategory", {
          verifId,
          ref: group.ref || group.datum,
          name: category.name,
        })
      );
    }

    const now = new Date().toISOString();
    entries.push({
      date: group.datum,
      description: group.ref || `Verifikation ${verifId}`,
      transactionType,
      category: category.id,
      totalAmount,
      vatRate,
      vatAmount,
      lines: entryLines,
    });

    void now; // createdAt/updatedAt added by Firestore write
  }

  return { entries, errors, warnings };
}

// CSV template that users can download
export const CSV_TEMPLATE = `date,description,transactionType,category,totalAmount,vatRate
2024-01-15,Kontorsmaterial från Staples,cost,office_supplies,1250.00,25
2024-01-20,Månadsfaktura telefonabonnemang,cost,telecom,499.00,25
2024-01-31,Konsultarvode kund AB,income,service_sales_25,15000.00,25
2024-02-05,Redovisningsbyrå februari,cost,accounting_services,2500.00,25
2024-02-10,Försäljning varor,income,goods_sales_25,8500.00,25
`;

// Reference list of all valid category IDs
export const CATEGORY_REFERENCE = ACCOUNT_CATEGORIES.map((c) => ({
  id: c.id,
  name: c.name,
  type: c.transactionType,
  defaultVatRate: c.defaultVatRate,
}));
