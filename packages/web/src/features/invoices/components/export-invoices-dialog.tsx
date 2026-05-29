import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Download, FileDown, CalendarDays } from "lucide-react";
import { currentLocale } from "@/i18n";
import type { Invoice, Customer } from "@crm/shared";
import {
  exportInvoicesToCsv,
  countFilteredInvoices,
} from "../utils/csv-export";

interface ExportInvoicesDialogProps {
  invoices: Invoice[];
  customers: Customer[];
  onClose: () => void;
}

const INPUT_CLASS =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors";

export function ExportInvoicesDialog({
  invoices,
  customers,
  onClose,
}: ExportInvoicesDialogProps) {
  const { t } = useTranslation("invoices");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exported, setExported] = useState(false);
  const [exportedCount, setExportedCount] = useState(0);

  const matchCount = countFilteredInvoices(
    invoices,
    dateFrom || undefined,
    dateTo || undefined
  );

  // Quick date presets
  function setPreset(preset: "thisMonth" | "lastMonth" | "thisYear" | "lastYear" | "all") {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth(); // 0-indexed

    if (preset === "all") {
      setDateFrom("");
      setDateTo("");
    } else if (preset === "thisMonth") {
      setDateFrom(`${y}-${String(m + 1).padStart(2, "0")}-01`);
      const lastDay = new Date(y, m + 1, 0).getDate();
      setDateTo(`${y}-${String(m + 1).padStart(2, "0")}-${lastDay}`);
    } else if (preset === "lastMonth") {
      const lm = m === 0 ? 12 : m;
      const ly = m === 0 ? y - 1 : y;
      setDateFrom(`${ly}-${String(lm).padStart(2, "0")}-01`);
      const lastDay = new Date(ly, lm, 0).getDate();
      setDateTo(`${ly}-${String(lm).padStart(2, "0")}-${lastDay}`);
    } else if (preset === "thisYear") {
      setDateFrom(`${y}-01-01`);
      setDateTo(`${y}-12-31`);
    } else if (preset === "lastYear") {
      setDateFrom(`${y - 1}-01-01`);
      setDateTo(`${y - 1}-12-31`);
    }
  }

  function handleExport() {
    const result = exportInvoicesToCsv(
      invoices,
      customers,
      dateFrom || undefined,
      dateTo || undefined
    );
    setExportedCount(result.count);
    setExported(true);
  }

  // Summary stats for the filtered set
  const filtered = invoices.filter((inv) => {
    if (dateFrom && inv.invoiceDate < dateFrom) return false;
    if (dateTo && inv.invoiceDate > dateTo) return false;
    return true;
  });

  const totalExcl = filtered.reduce((s, inv) => s + inv.subtotal, 0);
  const totalVat = filtered.reduce((s, inv) => s + inv.vatAmount, 0);
  const totalIncl = filtered.reduce((s, inv) => s + inv.totalAmount, 0);
  const statusCounts = filtered.reduce<Record<string, number>>((acc, inv) => {
    acc[inv.status] = (acc[inv.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <FileDown className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">{t("export.title")}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Date range */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t("export.timePeriod")}</span>
            </div>

            {/* Presets */}
            <div className="flex flex-wrap gap-2 mb-3">
              {(
                ["all", "thisMonth", "lastMonth", "thisYear", "lastYear"] as const
              ).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setPreset(preset)}
                  className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
                >
                  {t(`export.presets.${preset}`)}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("export.fromDate")}
                </label>
                <input
                  type="date"
                  className={INPUT_CLASS}
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  placeholder={t("export.fromPlaceholder")}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("export.toDate")}
                </label>
                <input
                  type="date"
                  className={INPUT_CLASS}
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>

            {!dateFrom && !dateTo && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {t("export.noDates")}
              </p>
            )}
          </div>

          {/* Summary */}
          {matchCount > 0 ? (
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
              <p className="text-sm font-medium">
                {t("export.match", { count: matchCount })}
              </p>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">{t("export.exclVat")}</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {totalExcl.toLocaleString(currentLocale(), { minimumFractionDigits: 0 })} kr
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("export.vat")}</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {totalVat.toLocaleString(currentLocale(), { minimumFractionDigits: 0 })} kr
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("export.totalIncl")}</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {totalIncl.toLocaleString(currentLocale(), { minimumFractionDigits: 0 })} kr
                  </p>
                </div>
              </div>

              {Object.keys(statusCounts).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(statusCounts).map(([status, count]) => (
                    <span
                      key={status}
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs"
                    >
                      {t(`status.${status}`, { defaultValue: status })}:{" "}
                      <span className="font-medium">{count}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <p className="text-sm text-muted-foreground text-center">
                {t("export.noMatch")}
              </p>
            </div>
          )}

          {/* Exported confirmation */}
          {exported && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
              <p className="text-sm text-green-700 font-medium">
                {t("export.exported", { count: exportedCount })}
              </p>
              <p className="text-xs text-green-600 mt-0.5">
                {t("export.exportedHint")}
              </p>
            </div>
          )}

          {/* CSV column info */}
          <details className="group">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground select-none">
              {t("export.showColumns")}
            </summary>
            <div className="mt-2 text-xs text-muted-foreground font-mono bg-muted/30 rounded-md px-3 py-2 leading-relaxed">
              invoiceNumber, invoiceRef, customerName, invoiceDate, dueDate, paidDate, status, subtotal, vatAmount, totalAmount, currency, overdueInterestRate, isInternational, language, notes, createdAt
            </div>
          </details>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            {t("export.close")}
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={matchCount === 0}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {matchCount > 0 ? t("export.exportButton", { count: matchCount }) : t("export.exportButtonEmpty")}
          </button>
        </div>
      </div>
    </div>
  );
}
