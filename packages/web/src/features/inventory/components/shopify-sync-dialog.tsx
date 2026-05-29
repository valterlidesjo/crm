import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { usePartner } from "@/lib/partner";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "@/lib/firebase";
import { useIsSuperAdmin } from "@/lib/auth";
import { X, RefreshCw, CheckCircle, AlertCircle, Settings, Webhook } from "lucide-react";

interface SyncResult {
  totalProducts: number;
  created: number;
  synced: number;
}

interface ShopifySyncDialogProps {
  onClose: () => void;
  targetPartnerId?: string;
}

export function ShopifySyncDialog({ onClose, targetPartnerId }: ShopifySyncDialogProps) {
  const { t } = useTranslation("inventory");
  const { partnerId: contextPartnerId } = usePartner();
  const partnerId = targetPartnerId ?? contextPartnerId;
  const isSuperAdmin = useIsSuperAdmin();

  const [tab, setTab] = useState<"sync" | "settings">("sync");
  const [config, setConfig] = useState<{
    storeUrl: string;
    accessToken: string;
    webhookSecret: string;
    connectedAt?: string;
  } | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);

  // Settings form state
  const [storeUrl, setStoreUrl] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [forceStockOverwrite, setForceStockOverwrite] = useState(false);

  // Register webhooks state
  const [registeringWebhooks, setRegisteringWebhooks] = useState(false);
  const [webhookResult, setWebhookResult] = useState<{ created: number; updated: number } | null>(null);
  const [webhookError, setWebhookError] = useState<string | null>(null);

  useEffect(() => {
    async function loadConfig() {
      try {
        const snap = await getDoc(
          doc(db, `partners/${partnerId}/integrations/shopify`)
        );
        if (snap.exists()) {
          const data = snap.data() as typeof config & object;
          setConfig(data);
          setStoreUrl(data?.storeUrl ?? "");
          setWebhookSecret(data?.webhookSecret ?? "");
          // Don't pre-fill access token for security
        }
      } finally {
        setLoadingConfig(false);
      }
    }
    loadConfig();
  }, [partnerId]);

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!storeUrl.trim() || !accessToken.trim() || !webhookSecret.trim()) return;
    setSavingConfig(true);

    try {
      const data = {
        storeUrl: storeUrl.trim().replace(/^https?:\/\//, ""),
        accessToken: accessToken.trim(),
        webhookSecret: webhookSecret.trim(),
        connectedAt: new Date().toISOString(),
      };

      await setDoc(
        doc(db, `partners/${partnerId}/integrations/shopify`),
        data
      );

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

  async function handleRegisterWebhooks() {
    setRegisteringWebhooks(true);
    setWebhookResult(null);
    setWebhookError(null);

    try {
      const functions = getFunctions(app, "europe-west1");
      const registerFn = httpsCallable<{ partnerId: string }, { created: number; updated: number }>(
        functions,
        "registerShopifyWebhooks"
      );
      const result = await registerFn({ partnerId });
      setWebhookResult(result.data);
    } catch (err) {
      setWebhookError(err instanceof Error ? err.message : t("shopifySync.webhookFailed"));
    } finally {
      setRegisteringWebhooks(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);

    try {
      const functions = getFunctions(app, "europe-west1");
      const syncFn = httpsCallable<
        { partnerId: string; forceStockOverwrite?: boolean },
        SyncResult
      >(functions, "syncShopifyProducts");
      const result = await syncFn({ partnerId, forceStockOverwrite });
      setSyncResult(result.data);
    } catch (err) {
      setSyncError(
        err instanceof Error ? err.message : t("shopifySync.syncFailed")
      );
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-lg rounded-xl border border-border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">{t("shopifySync.title")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            type="button"
            onClick={() => setTab("sync")}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              tab === "sync"
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("shopifySync.tabSync")}
          </button>
          <button
            type="button"
            onClick={() => setTab("settings")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${
              tab === "settings"
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            {t("shopifySync.tabSettings")}
          </button>
        </div>

        <div className="p-6">
          {tab === "sync" ? (
            <div className="space-y-4">
              {loadingConfig ? (
                <p className="text-sm text-muted-foreground">{t("shopifySync.loading")}</p>
              ) : !config ? (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-700">
                  <p className="font-medium">{t("shopifySync.notConfigured")}</p>
                  <p className="mt-1 text-orange-600">
                    {t("shopifySync.notConfiguredHelp")}
                  </p>
                  <button
                    type="button"
                    onClick={() => setTab("settings")}
                    className="mt-2 text-orange-700 underline hover:no-underline"
                  >
                    {t("shopifySync.openSettings")}
                  </button>
                </div>
              ) : (
                <>
                  {/* Connection status */}
                  <div className="flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
                    <CheckCircle className="h-4 w-4 shrink-0" />
                    <span>
                      {t("shopifySync.connectedTo")}{" "}
                      <span className="font-medium">{config.storeUrl}</span>
                    </span>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {t("shopifySync.syncDescription")}
                    </p>

                    <label className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50 transition-colors">
                      <input
                        type="checkbox"
                        checked={forceStockOverwrite}
                        onChange={(e) => setForceStockOverwrite(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-medium">{t("shopifySync.overwriteStock")}</span>
                        <span className="block text-xs text-muted-foreground">
                          {t("shopifySync.overwriteStockHelp")}
                        </span>
                      </span>
                    </label>

                    {syncResult && (
                      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
                        <p className="font-medium">{t("shopifySync.syncComplete")}</p>
                        <ul className="mt-1 space-y-0.5 text-green-600">
                          <li>
                            {t("shopifySync.totalProducts", { value: syncResult.totalProducts })}
                          </li>
                          <li>{t("shopifySync.new", { value: syncResult.created })}</li>
                          <li>{t("shopifySync.updated", { value: syncResult.synced })}</li>
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

                  {isSuperAdmin && (
                    <div className="space-y-2 border-t border-border pt-4">
                      <p className="text-sm font-medium">{t("shopifySync.webhookRegistration")}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("shopifySync.webhookHelp")}
                      </p>
                      {webhookResult && (
                        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                          <p className="font-medium">{t("shopifySync.webhooksRegistered")}</p>
                          <p className="text-green-600">{t("shopifySync.webhookResult", { created: webhookResult.created, updated: webhookResult.updated })}</p>
                        </div>
                      )}
                      {webhookError && (
                        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                          <p>{webhookError}</p>
                        </div>
                      )}
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={handleRegisterWebhooks}
                          disabled={registeringWebhooks}
                          className="flex items-center gap-1.5 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
                        >
                          <Webhook className={`h-4 w-4 ${registeringWebhooks ? "animate-pulse" : ""}`} />
                          {registeringWebhooks ? t("shopifySync.registeringWebhooks") : t("shopifySync.registerWebhooks")}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                    >
                      {t("shopifySync.close")}
                    </button>
                    <button
                      type="button"
                      onClick={handleSync}
                      disabled={syncing}
                      className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`}
                      />
                      {syncing ? t("shopifySync.syncing") : t("shopifySync.startSync")}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  {t("shopifySync.storeUrl")}
                </label>
                <input
                  type="text"
                  value={storeUrl}
                  onChange={(e) => setStoreUrl(e.target.value)}
                  placeholder={t("shopifySync.storeUrlPlaceholder")}
                  required
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("shopifySync.storeUrlHelp")}
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  {t("shopifySync.accessToken")}
                </label>
                <input
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder={config ? t("shopifySync.keepExisting") : "shpat_..."}
                  required={!config}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("shopifySync.accessTokenHelp")}
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  {t("shopifySync.webhookSecret")}
                </label>
                <input
                  type="password"
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                  placeholder={config ? t("shopifySync.keepExisting") : t("shopifySync.webhookSecretPlaceholder")}
                  required={!config}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                  {t("shopifySync.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {savingConfig
                    ? t("shopifySync.savingConfig")
                    : configSaved
                      ? t("shopifySync.savedConfig")
                      : t("shopifySync.saveConnect")}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
