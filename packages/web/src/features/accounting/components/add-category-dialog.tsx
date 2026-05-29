import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AccountCategory, VatRate } from "@crm/shared";

interface AddCategoryDialogProps {
  open: boolean;
  defaultType: "cost" | "income";
  defaultName?: string;
  onAdd: (cat: Omit<AccountCategory, "id">) => Promise<void>;
  onClose: () => void;
}

const VAT_OPTIONS: { value: VatRate; label: string }[] = [
  { value: "25", label: "25%" },
  { value: "12", label: "12%" },
  { value: "6", label: "6%" },
  { value: "0", label: "0%" },
];

export function AddCategoryDialog({ open, defaultType, defaultName = "", onAdd, onClose }: AddCategoryDialogProps) {
  const { t } = useTranslation("accounting");
  const [name, setName] = useState(defaultName);
  const [transactionType, setTransactionType] = useState<"cost" | "income">(defaultType);
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [vatAccountNumber, setVatAccountNumber] = useState(defaultType === "cost" ? "2640" : "2610");
  const [vatRate, setVatRate] = useState<VatRate>("25");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  function handleTypeChange(type: "cost" | "income") {
    setTransactionType(type);
    setVatAccountNumber(type === "cost" ? "2640" : "2610");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name || !accountNumber || !accountName) return;
    setSaving(true);
    try {
      await onAdd({
        name,
        transactionType,
        defaultAccountNumber: accountNumber,
        defaultAccountName: accountName,
        vatAccountNumber,
        paymentAccountNumber: "1930",
        defaultVatRate: vatRate,
      });
      onClose();
      setName("");
      setAccountNumber("");
      setAccountName("");
      setVatRate("25");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-lg">
        <h2 className="mb-4 text-base font-semibold">{t("addCategory.title")}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type toggle */}
          <div className="flex gap-2">
            {(["cost", "income"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleTypeChange(type)}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  transactionType === type
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {type === "cost" ? t("addCategory.cost") : t("addCategory.income")}
              </button>
            ))}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{t("addCategory.name")}</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("addCategory.namePlaceholder")}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">{t("addCategory.accountNumber")}</label>
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder={t("addCategory.accountNumberPlaceholder")}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("addCategory.accountName")}</label>
              <input
                type="text"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder={t("addCategory.accountNamePlaceholder")}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">{t("addCategory.vatAccount")}</label>
              <input
                type="text"
                value={vatAccountNumber}
                onChange={(e) => setVatAccountNumber(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t("addCategory.defaultVatRate")}</label>
              <select
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value as VatRate)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {VAT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              {t("addCategory.cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? t("addCategory.saving") : t("addCategory.addCategory")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
