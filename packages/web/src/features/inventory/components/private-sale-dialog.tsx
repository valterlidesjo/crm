import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useProducts } from "../hooks/use-products";
import { useCustomers } from "@/features/customers/hooks/use-customers";
import { useInvoices, generateInvoiceRef } from "@/features/invoices/hooks/use-invoices";
import type { Product } from "@crm/shared";
import { X, ChevronDown } from "lucide-react";

interface PrivateSaleDialogProps {
  product: Product;
  onClose: () => void;
}

export function PrivateSaleDialog({ product, onClose }: PrivateSaleDialogProps) {
  const { t } = useTranslation("inventory");
  const { decrementStock } = useProducts();
  const { customers } = useCustomers();
  const { addInvoice, generateInvoiceNumber } = useInvoices();

  const [quantity, setQuantity] = useState("1");
  const [linkCustomer, setLinkCustomer] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [createInvoice, setCreateInvoice] = useState(false);
  const [vatRate, setVatRate] = useState<"0" | "6" | "12" | "25">("25");
  const [dueDate, setDueDateState] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const qty = parseInt(quantity, 10) || 1;
  const unitPrice = product.price ?? 0;
  const subtotal = unitPrice * qty;
  const vatAmount = subtotal * (parseInt(vatRate, 10) / 100);
  const total = subtotal + vatAmount;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (qty < 1) return;
    setSaving(true);
    setError(null);

    try {
      // 1. Decrement stock in CRM (Firestore). CRM is the source of truth; the
      //    `syncStockToChannels` trigger fans this change out to Shopify + CDON.
      await decrementStock(product.id, qty);

      // 2. Create invoice if requested
      if (createInvoice && linkCustomer && selectedCustomerId) {
        const invoiceNumber = await generateInvoiceNumber();
        const ref = generateInvoiceRef();
        await addInvoice({
          customerId: selectedCustomerId,
          invoiceNumber,
          invoiceRef: ref,
          invoiceDate: new Date().toISOString().split("T")[0],
          dueDate,
          status: "created",
          items: [
            {
              description: product.title,
              quantity: qty,
              unitPrice,
              vatRate,
            },
          ],
          subtotal,
          vatAmount,
          totalAmount: total,
          currency: "SEK",
          overdueInterestRate: 8,
          isRecurring: false,
          isInternational: false,
          language: "sv",
        });
      }

      setDone(true);
    } catch (err) {
      setError(t("privateSale.error"));
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="relative w-full max-w-sm rounded-xl border border-border bg-background shadow-xl p-6 text-center">
          <div className="mb-3 flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg
                className="h-6 w-6 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          </div>
          <h3 className="text-lg font-semibold">{t("privateSale.doneTitle")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("privateSale.doneMessage")}
            {createInvoice && linkCustomer && selectedCustomerId
              ? ` ${t("privateSale.doneInvoiceCreated")}`
              : ""}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {t("privateSale.close")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">{t("privateSale.title")}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {product.title}
              {product.sku ? ` · ${product.sku}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Quantity */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">{t("privateSale.quantity")}</label>
            <input
              type="number"
              min="1"
              max={product.stock || 999}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {t("privateSale.inStock", { stock: product.stock })}
              {unitPrice ? ` · ${t("privateSale.eachPrice", { price: unitPrice })}` : ""}
            </p>
            {qty > product.stock && (
              <p className="mt-1 text-xs text-orange-500">
                {t("privateSale.exceedsStock", { stock: product.stock })}
              </p>
            )}
          </div>

          {/* Link to customer */}
          <div className="rounded-lg border border-border p-4 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={linkCustomer}
                onChange={(e) => setLinkCustomer(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              <span className="text-sm font-medium">{t("privateSale.linkCustomer")}</span>
            </label>

            {linkCustomer && (
              <div className="relative">
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full appearance-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 pr-8"
                >
                  <option value="">{t("privateSale.selectCustomer")}</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Create invoice */}
          <div className="rounded-lg border border-border p-4 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={createInvoice}
                onChange={(e) => setCreateInvoice(e.target.checked)}
                disabled={!linkCustomer || !selectedCustomerId}
                className="h-4 w-4 rounded border-border accent-primary disabled:opacity-40"
              />
              <span
                className={`text-sm font-medium ${!linkCustomer || !selectedCustomerId ? "text-muted-foreground" : ""}`}
              >
                {t("privateSale.createInvoice")}
              </span>
              {(!linkCustomer || !selectedCustomerId) && (
                <span className="text-xs text-muted-foreground">
                  {t("privateSale.requiresCustomer")}
                </span>
              )}
            </label>

            {createInvoice && linkCustomer && selectedCustomerId && (
              <div className="space-y-3">
                {unitPrice > 0 && (
                  <div className="rounded-md bg-muted/30 p-3 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("privateSale.net")}</span>
                      <span>{t("privateSale.amountWithUnit", { amount: subtotal.toFixed(2) })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("privateSale.vatWithRate", { rate: vatRate })}
                      </span>
                      <span>{t("privateSale.amountWithUnit", { amount: vatAmount.toFixed(2) })}</span>
                    </div>
                    <div className="flex justify-between font-medium border-t border-border pt-1 mt-1">
                      <span>{t("privateSale.total")}</span>
                      <span>{t("privateSale.amountWithUnit", { amount: total.toFixed(2) })}</span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      {t("privateSale.vat")}
                    </label>
                    <select
                      value={vatRate}
                      onChange={(e) =>
                        setVatRate(e.target.value as typeof vatRate)
                      }
                      className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="0">0%</option>
                      <option value="6">6%</option>
                      <option value="12">12%</option>
                      <option value="25">25%</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      {t("privateSale.dueDate")}
                    </label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDateState(e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              {t("privateSale.cancel")}
            </button>
            <button
              type="submit"
              disabled={saving || qty < 1}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? t("privateSale.registering") : t("privateSale.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
