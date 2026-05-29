import type { Customer, VatRateType } from "@crm/shared";
import i18n from "@/i18n";
import type { InvoiceLineData } from "./calculations";
import { calcInvoiceTotals } from "./calculations";
import type { InvoiceFormData } from "../hooks/use-invoices";

const t = () => i18n.getFixedT(null, "invoices");

export interface ParsedImportInvoice {
  invoiceDate: string;
  dueDate: string;
  customerName: string;
  customerId: string | null; // null = not matched
  invoiceNumber: string; // empty string = auto-generate
  items: InvoiceLineData[];
  currency: string;
  overdueInterestRate: number;
  notes: string;
  isInternational: boolean;
  language: "sv" | "en";
  // Calculated
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
}

export interface ImportResult {
  invoices: ParsedImportInvoice[];
  errors: string[];
  warnings: string[];
}

const VALID_VAT_RATES = ["0", "6", "12", "25"];

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

export function parseCsvInvoices(
  csvText: string,
  customers: Customer[]
): ImportResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const lines = csvText
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");

  if (lines.length < 2) {
    return {
      invoices: [],
      errors: [t()("import.errors.missingHeader")],
      warnings: [],
    };
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s/g, ""));

  const required = ["invoicedate", "duedate", "customername", "description"];
  for (const req of required) {
    if (!headers.includes(req)) {
      errors.push(t()("import.errors.missingColumn", { column: req }));
    }
  }
  if (errors.length > 0) return { invoices: [], errors, warnings };

  // Group rows by invoiceNumber (or by row index when invoiceNumber is empty)
  const invoiceMap = new Map<string, ParsedImportInvoice>();

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine.trim()) continue;

    const values = parseCSVLine(rawLine);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? "").trim();
    });

    const rowNum = i + 1;

    // Validate required
    if (!row["invoicedate"]) {
      errors.push(t()("import.errors.rowMissingInvoiceDate", { row: rowNum }));
      continue;
    }
    if (!row["duedate"]) {
      errors.push(t()("import.errors.rowMissingDueDate", { row: rowNum }));
      continue;
    }
    if (!row["customername"]) {
      errors.push(t()("import.errors.rowMissingCustomerName", { row: rowNum }));
      continue;
    }
    if (!row["description"]) {
      errors.push(t()("import.errors.rowMissingDescription", { row: rowNum }));
      continue;
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row["invoicedate"])) {
      errors.push(t()("import.errors.rowInvalidInvoiceDate", { row: rowNum }));
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row["duedate"])) {
      errors.push(t()("import.errors.rowInvalidDueDate", { row: rowNum }));
      continue;
    }

    // Resolve customer
    const customerName = row["customername"];
    const matchedCustomer = customers.find(
      (c) => c.name.toLowerCase() === customerName.toLowerCase()
    );
    if (!matchedCustomer) {
      warnings.push(
        t()("import.warnings.customerNotFound", { row: rowNum, customer: customerName })
      );
    }

    // Invoice number grouping key
    const rawInvoiceNumber = row["invoicenumber"] ?? "";
    // When empty, each row is its own invoice (key = `row-{i}`)
    const groupKey = rawInvoiceNumber || `__auto-row-${i}`;

    // VAT rate
    const rawVat = row["vatrate"] ?? "25";
    const vatRate = VALID_VAT_RATES.includes(rawVat)
      ? (rawVat as VatRateType)
      : "25";
    if (!VALID_VAT_RATES.includes(rawVat)) {
      warnings.push(
        t()("import.warnings.invalidVatRate", { row: rowNum, rate: rawVat })
      );
    }

    const lineItem: InvoiceLineData = {
      description: row["description"],
      quantity: parseFloat(row["quantity"] ?? "1") || 1,
      unitPrice: parseFloat(row["unitprice"] ?? "0") || 0,
      vatRate,
    };

    if (!invoiceMap.has(groupKey)) {
      invoiceMap.set(groupKey, {
        invoiceDate: row["invoicedate"],
        dueDate: row["duedate"],
        customerName,
        customerId: matchedCustomer?.id ?? null,
        invoiceNumber: rawInvoiceNumber,
        items: [],
        currency: row["currency"] || "SEK",
        overdueInterestRate: parseFloat(row["overdueinterestrate"] ?? "8") || 8,
        notes: row["notes"] ?? "",
        isInternational: row["isinternational"] === "true",
        language: row["language"] === "en" ? "en" : "sv",
        subtotal: 0,
        vatAmount: 0,
        totalAmount: 0,
      });
    }

    invoiceMap.get(groupKey)!.items.push(lineItem);
  }

  // Calculate totals for each invoice
  const invoices = Array.from(invoiceMap.values()).map((inv) => {
    const totals = calcInvoiceTotals(inv.items);
    return { ...inv, subtotal: totals.subtotal, vatAmount: totals.vatAmount, totalAmount: totals.total };
  });

  return { invoices, errors, warnings };
}

export function buildFormDataFromImport(
  inv: ParsedImportInvoice,
  resolvedInvoiceNumber: string
): Omit<InvoiceFormData, "invoiceNumber"> & { invoiceNumber: string } {
  return {
    customerId: inv.customerId ?? "",
    invoiceNumber: resolvedInvoiceNumber,
    invoiceRef: "",
    invoiceDate: inv.invoiceDate,
    items: inv.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      vatRate: item.vatRate,
    })),
    subtotal: inv.subtotal,
    vatAmount: inv.vatAmount,
    totalAmount: inv.totalAmount,
    currency: inv.currency,
    dueDate: inv.dueDate,
    overdueInterestRate: inv.overdueInterestRate,
    status: "created" as const,
    isRecurring: false,
    isInternational: inv.isInternational,
    language: inv.language,
    notes: inv.notes || undefined,
  };
}

export const CSV_TEMPLATE = `invoiceDate,dueDate,customerName,invoiceNumber,description,quantity,unitPrice,vatRate,currency,overdueInterestRate,notes,isInternational,language
2026-02-01,2026-03-03,Acme AB,,Konsulttjänster januari,10,1500.00,25,SEK,8,,false,sv
2026-02-01,2026-03-03,Acme AB,,Resekostnader,1,450.00,0,SEK,8,,false,sv
2026-02-10,2026-03-10,Acme AB,F-20260210-001,Software licens,1,5000.00,25,SEK,8,Årsavgift,false,sv
2026-02-15,2026-03-17,Beta Corp,F-20260215-001,Consulting services,20,1200.00,0,SEK,8,EU reverse charge,true,en
`;
