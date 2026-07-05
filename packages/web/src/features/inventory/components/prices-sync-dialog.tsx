import { useState } from "react";
import { useTranslation } from "react-i18next";
import { app } from "@/lib/firebase";
import { usePartner } from "@/lib/partner";
import { getFunctions, httpsCallable } from "firebase/functions";
import { X, RefreshCw, AlertCircle } from "lucide-react";

interface PricesSyncDialogProps {
  onClose: () => void;
  targetPartnerId?: string;
}

interface SyncAllPricesResult {
  total: number;
  pushed: { shopify: number; cdon: number };
  errors: Array<{ productId: string; channel: string }>;
}

export function PricesSyncDialog({ onClose, targetPartnerId }: PricesSyncDialogProps) {
  const { t } = useTranslation("inventory");
  const { partnerId: contextPartnerId } = usePartner();
  const partnerId = targetPartnerId ?? contextPartnerId;

  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncAllPricesResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setSyncing(true);
    setResult(null);
    setError(null);
    try {
      const fn = httpsCallable<{ partnerId: string }, SyncAllPricesResult>(
        getFunctions(app, "europe-west1"),
        "syncAllPrices"
      );
      const res = await fn({ partnerId });
      setResult(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("pricesSync.syncFailed"));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-lg rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">{t("pricesSync.title")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("pricesSync.description")}
          </p>

          {result && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
              <p className="font-medium">{t("pricesSync.syncComplete")}</p>
              <ul className="mt-1 space-y-0.5 text-green-600">
                <li>{t("pricesSync.totalProducts", { value: result.total })}</li>
                <li>
                  {t("pricesSync.shopifyPushed", { value: result.pushed.shopify })}
                </li>
                <li>{t("pricesSync.cdonPushed", { value: result.pushed.cdon })}</li>
                {result.errors.length > 0 && (
                  <li className="text-red-600">
                    {t("pricesSync.errors", {
                      count: result.errors.length,
                      value: result.errors.length,
                    })}
                  </li>
                )}
              </ul>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              {t("pricesSync.close")}
            </button>
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? t("pricesSync.syncing") : t("pricesSync.startSync")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

