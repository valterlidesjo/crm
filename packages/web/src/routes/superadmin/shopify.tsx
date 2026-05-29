import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { createFileRoute } from "@tanstack/react-router";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { requireSuperAdmin } from "@/lib/route-guards";
import { usePartners } from "@/features/partners/hooks/use-partners";
import { ShopifySyncDialog } from "@/features/inventory/components/shopify-sync-dialog";
import { PageContainer } from "@/components/layout/page-container";
import { RefreshCw, CheckCircle, XCircle } from "lucide-react";

export const Route = createFileRoute("/superadmin/shopify")({
  beforeLoad: ({ context }) => requireSuperAdmin(context.auth),
  component: SuperAdminShopifyPage,
});

function SuperAdminShopifyPage() {
  const { t } = useTranslation("partners");
  const { partners, loading } = usePartners();
  const [shopifyStatus, setShopifyStatus] = useState<Record<string, boolean>>({});
  const [managingPartnerId, setManagingPartnerId] = useState<string | null>(null);

  useEffect(() => {
    if (partners.length === 0) return;
    Promise.all(
      partners.map(async (p) => {
        const snap = await getDoc(doc(db, `partners/${p.id}/integrations/shopify`));
        return [p.id, snap.exists()] as const;
      })
    ).then((entries) => setShopifyStatus(Object.fromEntries(entries))).catch(console.error);
  }, [partners]);

  return (
    <PageContainer title={t("shopify.title")} description={t("shopify.description")}>
      <div className="space-y-2">
        {loading ? (
          <p className="text-sm text-muted-foreground">{t("shopify.loading")}</p>
        ) : partners.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">{t("shopify.empty")}</p>
          </div>
        ) : (
          partners.map((partner) => (
            <div
              key={partner.id}
              className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3"
            >
              <div className="flex items-center gap-3">
                {shopifyStatus[partner.id] ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-muted-foreground" />
                )}
                <div>
                  <p className="text-sm font-medium">{partner.name}</p>
                  <p className="text-xs text-muted-foreground">{partner.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setManagingPartnerId(partner.id)}
                className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t("shopify.manage")}
              </button>
            </div>
          ))
        )}
      </div>

      {managingPartnerId && (
        <ShopifySyncDialog
          targetPartnerId={managingPartnerId}
          onClose={() => setManagingPartnerId(null)}
        />
      )}
    </PageContainer>
  );
}
