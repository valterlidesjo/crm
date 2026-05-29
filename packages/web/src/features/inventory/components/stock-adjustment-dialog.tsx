import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useProducts } from "../hooks/use-products";
import type { Product } from "@crm/shared";
import { X } from "lucide-react";

interface StockAdjustmentDialogProps {
  product: Product;
  onClose: () => void;
}

export function StockAdjustmentDialog({
  product,
  onClose,
}: StockAdjustmentDialogProps) {
  const { t } = useTranslation("inventory");
  const { updateStock } = useProducts();

  const [stockValue, setStockValue] = useState(product.stock.toString());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newStock = parseInt(stockValue, 10) || 0;
    if (newStock === product.stock) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);

    try {
      // CRM is the source of truth. The `syncStockToChannels` Cloud Function
      // trigger pushes this change out to Shopify and CDON automatically.
      await updateStock(product.id, newStock);
      onClose();
    } catch (err) {
      setError(t("stockAdjust.error"));
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-md rounded-xl border border-border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">{t("stockAdjust.title")}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {product.title}
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">{product.title}</p>
              {product.sku && (
                <p className="text-xs text-muted-foreground">
                  {t("stockAdjust.skuLabel", { sku: product.sku })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {t("stockAdjust.current", { stock: product.stock })}
              </span>
              <input
                type="number"
                min="0"
                value={stockValue}
                onChange={(e) => setStockValue(e.target.value)}
                className="w-20 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-right outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {(product.shopifyProductId || product.cdonSku) && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
              {t("stockAdjust.channelNotice", {
                channels: [
                  product.shopifyProductId && "Shopify",
                  product.cdonSku && "CDON",
                ]
                  .filter(Boolean)
                  .join(t("stockAdjust.joinAnd")),
              })}
            </p>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              {t("stockAdjust.cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? t("stockAdjust.saving") : t("stockAdjust.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
