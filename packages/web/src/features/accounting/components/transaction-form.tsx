import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AccountCategory, JournalEntry, VatRate } from "@crm/shared";
import { buildJournalEntry } from "../utils/journal-entry-builder";
import { useTransactionForm } from "../hooks/use-transaction-form";
import { CategoryCombobox } from "./category-combobox";
import { AddCategoryDialog } from "./add-category-dialog";

interface TransactionFormProps {
  categories: AccountCategory[];
  onSubmit: (
    entry: Omit<JournalEntry, "id" | "createdAt" | "updatedAt">
  ) => void | Promise<void>;
  onAddCategory: (cat: Omit<AccountCategory, "id">) => Promise<void>;
}

const VAT_OPTIONS: { value: VatRate; label: string }[] = [
  { value: "25", label: "25%" },
  { value: "12", label: "12%" },
  { value: "6", label: "6%" },
  { value: "0", label: "0%" },
];

export function TransactionForm({
  categories,
  onSubmit,
  onAddCategory,
}: TransactionFormProps) {
  const { t } = useTranslation("accounting");
  const form = useTransactionForm(categories);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [pendingName, setPendingName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // After creating a category from the combobox, auto-select it once it
  // shows up in the live category list.
  useEffect(() => {
    if (!pendingName) return;
    const match = categories.find(
      (c) => c.name.toLowerCase() === pendingName.toLowerCase()
    );
    if (match) {
      form.handleCategoryChange(match.id);
      setPendingName("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  function handleCreateNew(query: string) {
    setPendingName(query);
    setShowAddCategory(true);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    if (!form.selectedCategory) {
      setError(t("transactionForm.pickCategory"));
      return;
    }
    const amount = parseFloat(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(t("transactionForm.amountGreaterThanZero"));
      return;
    }
    if (!form.date) {
      setError(t("transactionForm.pickDate"));
      return;
    }

    const entry = buildJournalEntry({
      category: form.selectedCategory,
      totalAmount: amount,
      date: form.date,
      description: form.description,
      vatRate: form.vatRate,
    });

    setSaving(true);
    setError(null);
    try {
      await onSubmit(entry);
      form.reset();
    } catch (err) {
      setError(
        err instanceof Error
          ? t("transactionForm.couldNotSave", { message: err.message })
          : t("transactionForm.couldNotSaveGeneric")
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Category — searchable; type a name or account number */}
          <CategoryCombobox
            categories={categories}
            value={form.categoryId}
            onChange={form.handleCategoryChange}
            onCreateNew={handleCreateNew}
            className="min-w-[220px] flex-1"
          />

          {/* Amount — the hero field */}
          <div className="relative w-36">
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => form.setAmount(e.target.value)}
              placeholder={t("transactionForm.amountPlaceholder")}
              className="w-full rounded-md border border-border bg-background py-2 pl-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {t("transactionForm.currencySuffix")}
            </span>
          </div>

          {/* VAT — defaults to 25% / the category default, kept compact */}
          <select
            value={form.vatRate}
            onChange={(e) => form.setVatRate(e.target.value as VatRate)}
            title={t("transactionForm.vatTitle")}
            className="w-[4.5rem] rounded-md border border-border bg-background px-2 py-2 text-sm text-muted-foreground"
          >
            {VAT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Date — defaults to today */}
          <input
            type="date"
            value={form.date}
            onChange={(e) => form.setDate(e.target.value)}
            className="w-[9.5rem] rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />

          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? t("transactionForm.saving") : t("transactionForm.add")}
          </button>
        </div>

        {/* Optional note — stays out of the way */}
        <input
          type="text"
          value={form.description}
          onChange={(e) => form.setDescription(e.target.value)}
          placeholder={t("transactionForm.descriptionPlaceholder")}
          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </form>

      <AddCategoryDialog
        key={pendingName || "new-category"}
        open={showAddCategory}
        defaultType={form.selectedCategory?.transactionType ?? "cost"}
        defaultName={pendingName}
        onAdd={onAddCategory}
        onClose={() => setShowAddCategory(false)}
      />
    </>
  );
}
