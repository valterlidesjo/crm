import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db, app } from "@/lib/firebase";
import { usePartner } from "@/lib/partner";
import { getFunctions, httpsCallable } from "firebase/functions";
import { X, RefreshCw, CheckCircle, AlertCircle, Settings, Download } from "lucide-react";

interface CdonSyncDialogProps {
  onClose: () => void;
  targetPartnerId?: string;
}

interface SyncResult {
  linked: number;
  pushed: number;
  missing: number;
}

interface PollResult {
  orders: number;
  applied: number;
}

export function CdonSyncDialog({ onClose, targetPartnerId }: CdonSyncDialogProps) {
  const { t } = useTranslation("inventory");
  const { partnerId: contextPartnerId } = usePartner();
  const partnerId = targetPartnerId ?? contextPartnerId;

  const [tab, setTab] = useState<"sync" | "settings">("sync");
  const [config, setConfig] = useState<{ merchantId: string; market?: string; connectedAt?: string } | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);

  const [merchantId, setMerchantId] = useState("");
  const [token, setToken] = useState("");
  const [market, setMarket] = useState("SE");
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [polling, setPolling] = useState(false);
  const [pollResult, setPollResult] = useState<PollResult | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDoc(doc(db, `partners/${partnerId}/integrations/cdon`));
        if (snap.exists()) {
          const data = snap.data() as typeof config & object;
          setConfig(data);
          setMerchantId(data?.merchantId ?? "");
          setMarket(data?.market ?? "SE");
        }
      } finally {
        setLoadingConfig(false);
      }
    }
    load();
  }, [partnerId]);

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!merchantId.trim() || !token.trim()) return;
    setSavingConfig(true);
    try {
      const data = {
        merchantId: merchantId.trim(),
        token: token.trim(),
        market: market.trim() || "SE",
        connectedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, `partners/${partnerId}/integrations/cdon`), data);
      setConfig(data);
      setConfigSaved(true);
      setTimeout(() => {
        setConfigSaved(false);
        setTab("sync");
      }, 1500);
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);
    try {
      const fn = httpsCallable<{ partnerId: string }, SyncResult>(
        getFunctions(app, "europe-west1"),
        "syncCdonProducts"
      );
      const res = await fn({ partnerId });
      setSyncResult(res.data);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : t("cdonSync.syncFailed"));
    } finally {
      setSyncing(false);
    }
  }

  async function handlePoll() {
    setPolling(true);
    setPollResult(null);
    setPollError(null);
    try {
      const fn = httpsCallable<{ partnerId: string }, PollResult>(
        getFunctions(app, "europe-west1"),
        "pollCdonOrdersNow"
      );
      const res = await fn({ partnerId });
      setPollResult(res.data);
    } catch (err) {
      setPollError(err instanceof Error ? err.message : t("cdonSync.pollFailed"));
    } finally {
      setPolling(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-lg rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">{t("cdonSync.title")}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex border-b border-border">
          <button
            type="button"
            onClick={() => setTab("sync")}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === "sync" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t("cdonSync.tabSync")}
          </button>
          <button
            type="button"
            onClick={() => setTab("settings")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${tab === "settings" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Settings className="h-3.5 w-3.5" />
            {t("cdonSync.tabSettings")}
          </button>
        </div>

        <div className="p-6">
          {tab === "sync" ? (
            <div className="space-y-4">
              {loadingConfig ? (
                <p className="text-sm text-muted-foreground">{t("cdonSync.loading")}</p>
              ) : !config ? (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-700">
                  <p className="font-medium">{t("cdonSync.notConfigured")}</p>
                  <p className="mt-1 text-orange-600">{t("cdonSync.notConfiguredHelp")}</p>
                  <button type="button" onClick={() => setTab("settings")} className="mt-2 text-orange-700 underline hover:no-underline">
                    {t("cdonSync.openSettings")}
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
                    <CheckCircle className="h-4 w-4 shrink-0" />
                    <span>{t("cdonSync.connectedMerchant")} <span className="font-mono">{config.merchantId.slice(0, 8)}…</span></span>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {t("cdonSync.syncDescription")}
                    </p>
                    {syncResult && (
                      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
                        <p className="font-medium">{t("cdonSync.syncComplete")}</p>
                        <ul className="mt-1 space-y-0.5 text-green-600">
                          <li>{t("cdonSync.linkedPushed", { value: syncResult.pushed })}</li>
                          <li>{t("cdonSync.notFound", { value: syncResult.missing })}</li>
                        </ul>
                      </div>
                    )}
                    {syncError && (
                      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        <p>{syncError}</p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 border-t border-border pt-4">
                    <p className="text-sm font-medium">{t("cdonSync.orders")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("cdonSync.ordersHelp")}
                    </p>
                    {pollResult && (
                      <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                        {t("cdonSync.pollResult", { count: pollResult.orders, orders: pollResult.orders, applied: pollResult.applied })}
                      </div>
                    )}
                    {pollError && (
                      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        <p>{pollError}</p>
                      </div>
                    )}
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handlePoll}
                        disabled={polling}
                        className="flex items-center gap-1.5 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
                      >
                        <Download className={`h-4 w-4 ${polling ? "animate-pulse" : ""}`} />
                        {polling ? t("cdonSync.polling") : t("cdonSync.pollOrders")}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
                      {t("cdonSync.close")}
                    </button>
                    <button
                      type="button"
                      onClick={handleSync}
                      disabled={syncing}
                      className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                      {syncing ? t("cdonSync.syncing") : t("cdonSync.startSync")}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">{t("cdonSync.merchantId")}</label>
                <input
                  type="text"
                  value={merchantId}
                  onChange={(e) => setMerchantId(e.target.value)}
                  placeholder={t("cdonSync.merchantIdPlaceholder")}
                  required
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">{t("cdonSync.apiToken")}</label>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={config ? t("cdonSync.keepExisting") : t("cdonSync.apiTokenPlaceholder")}
                  required={!config}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
                <p className="mt-1 text-xs text-muted-foreground">{t("cdonSync.apiTokenHelp")}</p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">{t("cdonSync.market")}</label>
                <input
                  type="text"
                  value={market}
                  onChange={(e) => setMarket(e.target.value)}
                  placeholder={t("cdonSync.marketPlaceholder")}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
                  {t("cdonSync.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {savingConfig ? t("cdonSync.savingConfig") : configSaved ? t("cdonSync.savedConfig") : t("cdonSync.saveConnect")}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
