import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { createFileRoute } from "@tanstack/react-router";
import { Upload, FileDown, AlertTriangle } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { TransactionForm } from "@/features/accounting/components/transaction-form";
import { JournalEntryTable } from "@/features/accounting/components/journal-entry-table";
import { EditEntryDialog } from "@/features/accounting/components/edit-entry-dialog";
import { ExportEntriesDialog } from "@/features/accounting/components/export-entries-dialog";
import { ImportEntriesDialog } from "@/features/accounting/components/import-entries-dialog";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import {
  useJournalEntries,
  JOURNAL_ENTRY_QUERY_LIMIT,
} from "@/features/accounting/hooks/use-journal-entries";
import { useAccountCategories } from "@/features/accounting/hooks/use-account-categories";
import {
  derivePeriodRange,
  type Period,
} from "@/features/accounting/utils/period-range";
import { formatAmount } from "@/features/accounting/utils/format";
import { requireAdmin } from "@/lib/route-guards";
import type { JournalEntry, JournalEntrySource } from "@crm/shared";
import type { ParsedImportEntry } from "@/features/accounting/utils/csv-import";

const PERIOD_STORAGE_KEY = "accounting-period";

const PERIOD_OPTIONS: { value: Period; labelKey: string }[] = [
  { value: "this-month", labelKey: "page.period.thisMonth" },
  { value: "last-month", labelKey: "page.period.lastMonth" },
  { value: "this-quarter", labelKey: "page.period.thisQuarter" },
  { value: "last-quarter", labelKey: "page.period.lastQuarter" },
  { value: "all-time", labelKey: "page.period.allTime" },
];

type SourceFilter = "all" | JournalEntrySource;

const SOURCE_FILTER_OPTIONS: { value: SourceFilter; labelKey: string }[] = [
  { value: "all", labelKey: "page.sourceFilter.all" },
  { value: "manual", labelKey: "page.sourceFilter.manual" },
  { value: "import", labelKey: "page.sourceFilter.import" },
  { value: "invoice", labelKey: "page.sourceFilter.invoice" },
  { value: "purchase-order", labelKey: "page.sourceFilter.purchaseOrder" },
  { value: "shopify", labelKey: "page.sourceFilter.shopify" },
];

function savedPeriod(): Period {
  const saved = localStorage.getItem(PERIOD_STORAGE_KEY);
  return PERIOD_OPTIONS.some((o) => o.value === saved)
    ? (saved as Period)
    : "all-time";
}

export const Route = createFileRoute("/accounting/")({
  beforeLoad: ({ context }) => requireAdmin(context.auth),
  component: AccountingPage,
});

function AccountingPage() {
  const { t } = useTranslation("accounting");
  const [period, setPeriod] = useState<Period>(savedPeriod);

  const handlePeriodChange = useCallback((next: Period) => {
    setPeriod(next);
    localStorage.setItem(PERIOD_STORAGE_KEY, next);
  }, []);

  const dateRange = derivePeriodRange(period);
  const { entries, loading, error, addEntry, updateEntry, deleteEntry } =
    useJournalEntries(dateRange);
  const { categories, addCategory } = useAccountCategories();
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<JournalEntry | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Legacy entries have no `source`; treat them as manual for filtering.
  const visibleEntries = useMemo(
    () =>
      sourceFilter === "all"
        ? entries
        : entries.filter((e) => (e.source ?? "manual") === sourceFilter),
    [entries, sourceFilter]
  );

  const truncated = entries.length >= JOURNAL_ENTRY_QUERY_LIMIT;

  const totalCosts = visibleEntries
    .filter((e) => e.transactionType === "cost")
    .reduce((sum, e) => sum + e.totalAmount, 0);

  const totalIncome = visibleEntries
    .filter((e) => e.transactionType === "income")
    .reduce((sum, e) => sum + e.totalAmount, 0);

  const totalVat = visibleEntries.reduce((sum, e) => {
    if (e.transactionType === "cost") return sum - e.vatAmount;
    return sum + e.vatAmount;
  }, 0);

  async function handleConfirmDelete() {
    if (!deletingEntry) return;
    setDeleteError(null);
    try {
      await deleteEntry(deletingEntry.id);
      setDeletingEntry(null);
    } catch (err) {
      setDeleteError(
        err instanceof Error
          ? t("page.deleteError", { error: err.message })
          : t("page.deleteErrorGeneric")
      );
      setDeletingEntry(null);
    }
  }

  async function handleImport(
    parsedEntries: ParsedImportEntry[]
  ): Promise<{ successCount: number; errors: string[] }> {
    const errors: string[] = [];
    let successCount = 0;

    for (let i = 0; i < parsedEntries.length; i++) {
      const entry = parsedEntries[i];
      try {
        await addEntry({ ...entry, source: "import" });
        successCount++;
      } catch (err) {
        errors.push(
          t("page.importRowError", {
            row: i + 1,
            date: entry.date,
            description: entry.description,
            message: err instanceof Error ? err.message : t("page.unknownError"),
          })
        );
      }
    }

    // Imported entries are often historical — show everything so the user
    // can see what was just added instead of an empty current-period view.
    if (successCount > 0 && period !== "all-time") {
      handlePeriodChange("all-time");
    }

    return { successCount, errors };
  }

  return (
    <PageContainer
      title={t("page.title")}
      description={t("page.description")}
    >
      <div className="space-y-6">
        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <select
            value={period}
            onChange={(e) => handlePeriodChange(e.target.value as Period)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            {SOURCE_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            <Upload className="h-4 w-4" />
            {t("page.importCsv")}
          </button>
          <button
            type="button"
            onClick={() => setShowExport(true)}
            className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            <FileDown className="h-4 w-4" />
            {t("page.exportCsv")}
          </button>
        </div>

        {truncated && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {t("page.truncatedNotice", { limit: JOURNAL_ENTRY_QUERY_LIMIT })}
            </span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t("page.loadError", { error })}</span>
          </div>
        )}

        {deleteError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{deleteError}</span>
          </div>
        )}

        <TransactionForm categories={categories} onSubmit={addEntry} onAddCategory={addCategory} />

        {loading ? (
          <div className="rounded-lg border border-border p-8 text-center text-muted-foreground">
            {t("page.loadingEntries")}
          </div>
        ) : (
          <JournalEntryTable
            entries={visibleEntries}
            onEdit={setEditingEntry}
            onDelete={setDeletingEntry}
          />
        )}

        {/* Inline summary — no boxes */}
        {visibleEntries.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-1 text-sm">
            <span className="text-muted-foreground">
              {t("page.summary.entries", { count: visibleEntries.length })}
            </span>
            <span>
              <span className="text-muted-foreground">{t("page.summary.income")}</span>
              <span className="font-medium text-green-600">
                {formatAmount(totalIncome)} kr
              </span>
            </span>
            <span>
              <span className="text-muted-foreground">{t("page.summary.costs")}</span>
              <span className="font-medium text-red-600">
                {formatAmount(totalCosts)} kr
              </span>
            </span>
            <span>
              <span className="text-muted-foreground">{t("page.summary.result")}</span>
              <span
                className={
                  "font-semibold " +
                  (totalIncome - totalCosts >= 0
                    ? "text-green-600"
                    : "text-red-600")
                }
              >
                {formatAmount(totalIncome - totalCosts)} kr
              </span>
            </span>
            <span className="text-muted-foreground">
              {t("page.summary.vat", { amount: `${formatAmount(totalVat)}` })}
            </span>
          </div>
        )}

        <EditEntryDialog
          key={editingEntry?.id}
          open={editingEntry !== null}
          onOpenChange={(open) => {
            if (!open) setEditingEntry(null);
          }}
          entry={editingEntry}
          categories={categories}
          onSave={updateEntry}
        />

        <DeleteConfirmDialog
          open={deletingEntry !== null}
          onOpenChange={(open) => {
            if (!open) setDeletingEntry(null);
          }}
          title={t("page.deleteTitle")}
          description={
            deletingEntry
              ? deletingEntry.description
                ? t("page.deleteDescriptionWithLabel", {
                    date: deletingEntry.date,
                    description: deletingEntry.description,
                  })
                : t("page.deleteDescription", { date: deletingEntry.date })
              : ""
          }
          onConfirm={handleConfirmDelete}
        />
      </div>

      {showExport && (
        <ExportEntriesDialog
          entries={entries}
          onClose={() => setShowExport(false)}
        />
      )}

      {showImport && (
        <ImportEntriesDialog
          onClose={() => setShowImport(false)}
          onImport={handleImport}
        />
      )}
    </PageContainer>
  );
}
