import { useState } from "react";
import { X, Download, FileDown, CalendarDays } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { JournalEntry } from "@crm/shared";
import {
  exportEntriesToCsv,
  exportToVerifikationCsv,
  countFilteredEntries,
} from "../utils/csv-export";
import { formatAmount } from "../utils/format";

interface ExportEntriesDialogProps {
  entries: JournalEntry[];
  onClose: () => void;
}

const INPUT_CLASS =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors";

export function ExportEntriesDialog({
  entries,
  onClose,
}: ExportEntriesDialogProps) {
  const { t } = useTranslation("accounting");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exportFormat, setExportFormat] = useState<
    "internal" | "verifikation"
  >("internal");
  const [exported, setExported] = useState(false);
  const [exportedCount, setExportedCount] = useState(0);

  const matchCount = countFilteredEntries(entries, {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  function setPreset(
    preset: "thisMonth" | "lastMonth" | "thisYear" | "lastYear" | "all"
  ) {
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
    const opts = {
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    };
    const result =
      exportFormat === "verifikation"
        ? exportToVerifikationCsv(entries, opts)
        : exportEntriesToCsv(entries, opts);
    setExportedCount(result.count);
    setExported(true);
  }

  const filtered = entries.filter((e) => {
    if (dateFrom && e.date < dateFrom) return false;
    if (dateTo && e.date > dateTo) return false;
    return true;
  });

  const totalCosts = filtered
    .filter((e) => e.transactionType === "cost")
    .reduce((s, e) => s + e.totalAmount, 0);
  const totalIncome = filtered
    .filter((e) => e.transactionType === "income")
    .reduce((s, e) => s + e.totalAmount, 0);
  const totalVat = filtered.reduce((s, e) => {
    if (e.transactionType === "cost") return s - e.vatAmount;
    return s + e.vatAmount;
  }, 0);

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
            <h2 className="text-lg font-semibold">
              {t("export.title")}
            </h2>
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
          {/* Export format */}
          <div>
            <span className="text-sm font-medium block mb-2">
              {t("export.exportFormat")}
            </span>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["internal", t("export.formatInternalName"), t("export.formatInternalHint")],
                  [
                    "verifikation",
                    t("export.formatVerifikationName"),
                    t("export.formatVerifikationHint"),
                  ],
                ] as const
              ).map(([value, label, hint]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setExportFormat(value)}
                  className={`rounded-md border px-3 py-2 text-left transition-colors ${
                    exportFormat === value
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-muted/30"
                  }`}
                >
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs mt-0.5 font-mono opacity-70">{hint}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t("export.timePeriod")}</span>
            </div>

            {/* Presets */}
            <div className="flex flex-wrap gap-2 mb-3">
              {(
                [
                  ["all", t("export.presetAll")],
                  ["thisMonth", t("export.presetThisMonth")],
                  ["lastMonth", t("export.presetLastMonth")],
                  ["thisYear", t("export.presetThisYear")],
                  ["lastYear", t("export.presetLastYear")],
                ] as const
              ).map(([preset, label]) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setPreset(preset)}
                  className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("export.from")}
                </label>
                <input
                  type="date"
                  className={INPUT_CLASS}
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("export.to")}
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
                {t("export.noDatesNotice")}
              </p>
            )}
          </div>

          {/* Summary */}
          {matchCount > 0 ? (
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
              <p className="text-sm font-medium">
                {t("export.matchSummary", { count: matchCount })}
              </p>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">{t("export.costs")}</p>
                  <p className="text-sm font-semibold tabular-nums text-red-600">
                    {formatAmount(totalCosts)} kr
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("export.income")}</p>
                  <p className="text-sm font-semibold tabular-nums text-green-600">
                    {formatAmount(totalIncome)} kr
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("export.netVat")}</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {formatAmount(totalVat)} kr
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <p className="text-sm text-muted-foreground text-center">
                {t("export.noMatches")}
              </p>
            </div>
          )}

          {/* Exported confirmation */}
          {exported && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
              <p className="text-sm text-green-700 font-medium">
                {t("export.exportedSummary", { count: exportedCount })}
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
              {exportFormat === "verifikation"
                ? t("export.columnsVerifikation")
                : t("export.columnsInternal")}
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
            {matchCount > 0
              ? t("export.exportWithCount", { count: matchCount })
              : t("export.export")}
          </button>
        </div>
      </div>
    </div>
  );
}
