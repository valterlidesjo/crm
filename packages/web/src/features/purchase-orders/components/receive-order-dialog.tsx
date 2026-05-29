import { useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import { X, AlertCircle } from "lucide-react";
import { currentLocale } from "@/i18n";
import type { PurchaseOrder } from "@crm/shared";

interface ReceiveOrderDialogProps {
  order: PurchaseOrder;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function ReceiveOrderDialog({
  order,
  onConfirm,
  onClose,
}: ReceiveOrderDialogProps) {
  const { t } = useTranslation("purchaseOrders");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalFormatted = order.totalCostSEK.toLocaleString(currentLocale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  async function handleConfirm() {
    setConfirming(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("receive.genericError")
      );
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">{t("receive.title")}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={confirming}
            className="rounded-md p-1 hover:bg-muted transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Summary */}
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("receive.supplier")}</span>
              <span className="font-medium">{order.supplierName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("receive.items")}</span>
              <span>
                {t("list.itemCount", { count: order.items.length })}
              </span>
            </div>
            <div className="flex justify-between text-sm border-t border-border pt-2 mt-2">
              <span className="font-medium">{t("receive.totalCost")}</span>
              <span className="font-semibold tabular-nums">
                {totalFormatted}{" "}
                kr
              </span>
            </div>
          </div>

          {/* Items list */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              {t("receive.inventoryUpdated")}
            </p>
            {order.items.map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-muted-foreground">
                  {item.productTitle}
                  {item.variantTitle ? ` — ${item.variantTitle}` : ""}
                </span>
                <span className="font-medium tabular-nums">
                  {t("receive.pcs", { quantity: item.quantity })}
                </span>
              </div>
            ))}
          </div>

          {/* What will happen */}
          <p className="text-xs text-muted-foreground">
            <Trans
              i18nKey="receive.explanation"
              ns="purchaseOrders"
              values={{ total: totalFormatted }}
              components={[<strong />]}
            />
          </p>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={confirming}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            {t("receive.cancel")}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirming}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {confirming ? t("receive.confirming") : t("receive.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
