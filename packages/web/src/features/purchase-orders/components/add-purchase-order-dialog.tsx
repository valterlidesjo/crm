import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { X, Plus, Trash2 } from "lucide-react";
import { currentLocale } from "@/i18n";
import { ACCOUNT_CATEGORIES, Currency, calculatePOTotalSEK } from "@crm/shared";
import type { Product, PurchaseOrderItem } from "@crm/shared";
import type { PurchaseOrderFormData } from "../hooks/use-purchase-orders";

const PURCHASE_CATEGORIES = ACCOUNT_CATEGORIES.filter((c) =>
  ["goods_purchase", "goods_purchase_eu", "goods_purchase_non_eu"].includes(
    c.id
  )
);

const CURRENCIES = Currency.literals as readonly PurchaseOrderItem["currency"][];

// Default exchange rates — user always overrides these, they are just starting values
const DEFAULT_RATES: Record<PurchaseOrderItem["currency"], number> = {
  SEK: 1,
  EUR: 11.5,
  USD: 10.5,
  CNY: 1.45,
};

interface ItemRow {
  productId: string;
  productTitle: string;
  quantity: string;
  unitPriceInCurrency: string;
  currency: PurchaseOrderItem["currency"];
  rateToSEK: string;
}

interface AddPurchaseOrderDialogProps {
  products: Product[];
  onSave: (data: PurchaseOrderFormData) => Promise<void>;
  onClose: () => void;
}

export function AddPurchaseOrderDialog({
  products,
  onSave,
  onClose,
}: AddPurchaseOrderDialogProps) {
  const { t } = useTranslation("purchaseOrders");
  const today = new Date().toISOString().slice(0, 10);

  const [supplierName, setSupplierName] = useState("");
  const [orderDate, setOrderDate] = useState(today);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [markupPercent, setMarkupPercent] = useState("");
  const [accountingCategoryId, setAccountingCategoryId] = useState(
    "goods_purchase_non_eu"
  );
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemRow[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function emptyItem(): ItemRow {
    return {
      productId: "",
      productTitle: "",
      quantity: "1",
      unitPriceInCurrency: "",
      currency: "CNY",
      rateToSEK: String(DEFAULT_RATES["CNY"]),
    };
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateItem<K extends keyof ItemRow>(
    index: number,
    field: K,
    value: ItemRow[K]
  ) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, [field]: value };
        // When currency changes, reset the rate to a sensible default
        if (field === "currency") {
          updated.rateToSEK = String(
            DEFAULT_RATES[value as PurchaseOrderItem["currency"]]
          );
        }
        return updated;
      })
    );
  }

  function handleProductChange(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? { ...item, productId, productTitle: product.title }
          : item
      )
    );
  }

  // Live SEK preview
  const parsedItems = items.map((item) => ({
    quantity: parseFloat(item.quantity) || 0,
    unitPriceInCurrency: parseFloat(item.unitPriceInCurrency) || 0,
    rateToSEK: parseFloat(item.rateToSEK) || 0,
  }));
  const previewTotal = calculatePOTotalSEK(
    parsedItems,
    markupPercent ? parseFloat(markupPercent) : undefined
  );

  function validate(): string | null {
    if (!supplierName.trim()) return t("add.validation.enterSupplier");
    if (items.length === 0) return t("add.validation.atLeastOneItem");
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.productId) return t("add.validation.selectArticle", { row: i + 1 });
      const qty = parseFloat(item.quantity);
      if (!qty || qty <= 0) return t("add.validation.quantityPositive", { row: i + 1 });
      const price = parseFloat(item.unitPriceInCurrency);
      if (!price || price <= 0) return t("add.validation.pricePositive", { row: i + 1 });
      if (item.currency !== "SEK") {
        const rate = parseFloat(item.rateToSEK);
        if (!rate || rate <= 0)
          return t("add.validation.ratePositive", { row: i + 1 });
      }
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        supplierName: supplierName.trim(),
        orderDate,
        expectedDeliveryDate: expectedDeliveryDate || undefined,
        markupPercent: markupPercent ? parseFloat(markupPercent) : undefined,
        accountingCategoryId,
        notes: notes.trim() || undefined,
        items: items.map((item) => ({
          productId: item.productId,
          productTitle: item.productTitle,
          quantity: parseFloat(item.quantity),
          unitPriceInCurrency: parseFloat(item.unitPriceInCurrency),
          currency: item.currency,
          rateToSEK: item.currency === "SEK" ? 1 : parseFloat(item.rateToSEK),
        })),
      });
      onClose();
    } catch {
      setError(t("add.genericError"));
    } finally {
      setSaving(false);
    }
  }

  const activeProducts = useMemo(
    () => products.filter((p) => p.status === "active"),
    [products]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-background shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background px-6 py-4">
          <h2 className="text-lg font-semibold">{t("add.title")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic info */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                {t("add.fields.supplier")} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder={t("add.placeholders.supplier")}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                {t("add.fields.orderDate")} <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                {t("add.fields.expectedDeliveryDate")}
              </label>
              <input
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                {t("add.fields.markup")}
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={markupPercent}
                  onChange={(e) => setMarkupPercent(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="0.5"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 pr-8 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  %
                </span>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                {t("add.fields.accountingCategory")} <span className="text-red-500">*</span>
              </label>
              <select
                value={accountingCategoryId}
                onChange={(e) => setAccountingCategoryId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              >
                {PURCHASE_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                {t("add.fields.notes")}
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("add.placeholders.notes")}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium">
                {t("add.items.heading")} <span className="text-red-500">*</span>
              </h3>
              <button
                type="button"
                onClick={addItem}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> {t("add.items.addRow")}
              </button>
            </div>

            <div className="space-y-3">
              {/* Column headers */}
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
                <span className="col-span-3">{t("add.items.columns.article")}</span>
                <span className="col-span-1 text-right">{t("add.items.columns.qty")}</span>
                <span className="col-span-2 text-right">{t("add.items.columns.price")}</span>
                <span className="col-span-2">{t("add.items.columns.currency")}</span>
                <span className="col-span-2">{t("add.items.columns.rate")}</span>
                <span className="col-span-1 text-right">{t("add.items.columns.costSEK")}</span>
                <span className="col-span-1" />
              </div>

              {items.map((item, i) => {
                const itemQty = parseFloat(item.quantity) || 0;
                const itemPrice = parseFloat(item.unitPriceInCurrency) || 0;
                const itemRate =
                  item.currency === "SEK"
                    ? 1
                    : parseFloat(item.rateToSEK) || 0;
                const itemMarkup = markupPercent
                  ? parseFloat(markupPercent)
                  : undefined;
                const itemCostSEK =
                  itemQty * itemPrice * itemRate * (1 + (itemMarkup ?? 0) / 100);

                return (
                  <div
                    key={i}
                    className="grid grid-cols-12 gap-2 items-center rounded-lg border border-border/60 bg-muted/20 p-2"
                  >
                    {/* Article picker */}
                    <div className="col-span-3">
                      <select
                        value={item.productId}
                        onChange={(e) =>
                          handleProductChange(i, e.target.value)
                        }
                        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        <option value="">{t("add.items.selectArticle")}</option>
                        {activeProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                            {p.sku ? ` (${p.sku})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Quantity */}
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(i, "quantity", e.target.value)}
                      min="1"
                      step="1"
                      className="col-span-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-right outline-none focus:ring-2 focus:ring-primary/30"
                    />

                    {/* Unit price */}
                    <input
                      type="number"
                      value={item.unitPriceInCurrency}
                      onChange={(e) =>
                        updateItem(i, "unitPriceInCurrency", e.target.value)
                      }
                      placeholder="0"
                      min="0"
                      step="0.01"
                      className="col-span-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-right outline-none focus:ring-2 focus:ring-primary/30"
                    />

                    {/* Currency */}
                    <select
                      value={item.currency}
                      onChange={(e) =>
                        updateItem(
                          i,
                          "currency",
                          e.target.value as PurchaseOrderItem["currency"]
                        )
                      }
                      className="col-span-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      {CURRENCIES.map((code) => (
                        <option key={code} value={code}>
                          {code} — {t(`currency.${code}`)}
                        </option>
                      ))}
                    </select>

                    {/* Exchange rate (hidden for SEK) */}
                    <div className="col-span-2">
                      {item.currency === "SEK" ? (
                        <span className="block px-2 text-xs text-muted-foreground">
                          —
                        </span>
                      ) : (
                        <input
                          type="number"
                          value={item.rateToSEK}
                          onChange={(e) =>
                            updateItem(i, "rateToSEK", e.target.value)
                          }
                          placeholder="1.00"
                          min="0.0001"
                          step="0.0001"
                          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      )}
                    </div>

                    {/* Line cost preview */}
                    <div className="col-span-1 text-right text-xs font-medium tabular-nums text-muted-foreground">
                      {itemCostSEK > 0
                        ? itemCostSEK.toLocaleString(currentLocale(), {
                            maximumFractionDigits: 0,
                          })
                        : "—"}
                    </div>

                    {/* Remove */}
                    <div className="col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        disabled={items.length === 1}
                        className="rounded p-1 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Total preview */}
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {t("add.estimatedTotal")}
                {markupPercent && parseFloat(markupPercent) > 0 && (
                  <span className="ml-1 text-xs">
                    {t("add.inclMarkup", { markup: markupPercent })}
                  </span>
                )}
              </span>
              <span className="text-lg font-semibold tabular-nums">
                {previewTotal.toLocaleString(currentLocale(), {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                kr
              </span>
            </div>
          </div>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              {t("add.cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? t("add.saving") : t("add.create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
