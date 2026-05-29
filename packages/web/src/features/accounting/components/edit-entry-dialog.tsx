import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { AccountCategory, JournalEntry, VatRate } from "@crm/shared";
import { buildJournalEntry } from "../utils/journal-entry-builder";
import { useTransactionForm } from "../hooks/use-transaction-form";
import { cn } from "@/lib/utils";

interface EditEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: JournalEntry | null;
  categories: AccountCategory[];
  onSave: (
    id: string,
    data: Omit<JournalEntry, "id" | "createdAt" | "updatedAt">
  ) => void | Promise<void>;
}

const VAT_OPTIONS: { value: VatRate; label: string }[] = [
  { value: "25", label: "25%" },
  { value: "12", label: "12%" },
  { value: "6", label: "6%" },
  { value: "0", label: "0%" },
];

const INPUT_CLASS = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

export function EditEntryDialog({ open, onOpenChange, entry, categories, onSave }: EditEntryDialogProps) {
  const { t } = useTranslation("accounting");
  const form = useTransactionForm(categories, entry ? {
    transactionType: entry.transactionType,
    categoryId: entry.category,
    amount: String(entry.totalAmount),
    date: entry.date,
    description: entry.description,
    vatRate: entry.vatRate,
  } : undefined);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Entries that didn't originate from the manual form carry their own
  // multi-account line structure (e.g. imported verifications, invoice/PO
  // postings). Saving here regenerates simplified lines from the category, so
  // we warn before discarding that original structure.
  const isDerived = entry?.source != null && entry.source !== "manual";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    if (!entry || !form.selectedCategory || !form.amount || !form.date) return;

    const amount = parseFloat(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(t("editEntry.amountGreaterThanZero"));
      return;
    }

    const updated = buildJournalEntry({
      category: form.selectedCategory,
      totalAmount: amount,
      date: form.date,
      description: form.description,
      vatRate: form.vatRate,
    });

    setSaving(true);
    setError(null);
    try {
      await onSave(entry.id, updated);
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? t("editEntry.couldNotSave", { message: err.message })
          : t("editEntry.couldNotSaveGeneric")
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editEntry.title")}</DialogTitle>
          <DialogDescription>
            {t("editEntry.description")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isDerived && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {t("editEntry.derivedPrefix")}
                {entry?.source === "import"
                  ? t("editEntry.derivedSource.import")
                  : entry?.source === "invoice"
                    ? t("editEntry.derivedSource.invoice")
                    : entry?.source === "purchase-order"
                      ? t("editEntry.derivedSource.purchaseOrder")
                      : entry?.source}
                {t("editEntry.derivedSuffix")}
              </span>
            </div>
          )}

          {/* Type toggle */}
          <div className="flex gap-2">
            {(["cost", "income"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => form.switchType(type)}
                className={cn(
                  "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                  form.transactionType === type
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {type === "cost" ? t("editEntry.cost") : t("editEntry.income")}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Category */}
            <div>
              <label className="mb-1 block text-sm font-medium">{t("editEntry.category")}</label>
              <select
                value={form.categoryId}
                onChange={(e) => form.handleCategoryChange(e.target.value)}
                className={INPUT_CLASS}
                required
              >
                <option value="">{t("editEntry.selectCategory")}</option>
                {form.filteredCategories.map((cat: AccountCategory) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} ({cat.defaultAccountNumber})
                  </option>
                ))}
              </select>
            </div>

            {/* Amount */}
            <div>
              <label className="mb-1 block text-sm font-medium">{t("editEntry.amount")}</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) => form.setAmount(e.target.value)}
                placeholder="0.00"
                className={INPUT_CLASS}
                required
              />
            </div>

            {/* Date */}
            <div>
              <label className="mb-1 block text-sm font-medium">{t("editEntry.date")}</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => form.setDate(e.target.value)}
                className={INPUT_CLASS}
                required
              />
            </div>

            {/* VAT rate */}
            <div>
              <label className="mb-1 block text-sm font-medium">{t("editEntry.vatRate")}</label>
              <select
                value={form.vatRate}
                onChange={(e) => form.setVatRate(e.target.value as VatRate)}
                className={INPUT_CLASS}
              >
                {VAT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-sm font-medium">{t("editEntry.descriptionLabel")}</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => form.setDescription(e.target.value)}
              placeholder={t("editEntry.descriptionPlaceholder")}
              className={INPUT_CLASS}
            />
          </div>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              {t("editEntry.cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? t("editEntry.saving") : t("editEntry.saveChanges")}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
