import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { requireAdmin } from "@/lib/route-guards";
import { useProducts } from "@/features/inventory/hooks/use-products";
import { usePurchaseOrders } from "@/features/purchase-orders/hooks/use-purchase-orders";
import { PurchaseOrderList } from "@/features/purchase-orders/components/purchase-order-list";
import { AddPurchaseOrderDialog } from "@/features/purchase-orders/components/add-purchase-order-dialog";
import { ReceiveOrderDialog } from "@/features/purchase-orders/components/receive-order-dialog";
import type { PurchaseOrder } from "@crm/shared";

export const Route = createFileRoute("/purchase-orders/")({
  beforeLoad: ({ context }) => requireAdmin(context.auth),
  component: PurchaseOrdersPage,
});

function PurchaseOrdersPage() {
  const { t } = useTranslation("purchaseOrders");
  const { products } = useProducts();
  const { purchaseOrders, loading, addPurchaseOrder, cancelPurchaseOrder, receivePurchaseOrder } =
    usePurchaseOrders();

  const [showAdd, setShowAdd] = useState(false);
  const [receivingOrder, setReceivingOrder] = useState<PurchaseOrder | null>(null);

  return (
    <PageContainer
      title={t("page.title")}
      description={t("page.description")}
    >
      <div className="space-y-6">
        {/* Action bar */}
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t("page.newOrder")}
          </button>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            {t("page.loading")}
          </div>
        ) : (
          <PurchaseOrderList
            orders={purchaseOrders}
            onReceive={(order) => setReceivingOrder(order)}
            onCancel={(id) => cancelPurchaseOrder(id)}
          />
        )}
      </div>

      {showAdd && (
        <AddPurchaseOrderDialog
          products={products}
          onSave={addPurchaseOrder}
          onClose={() => setShowAdd(false)}
        />
      )}

      {receivingOrder && (
        <ReceiveOrderDialog
          order={receivingOrder}
          onConfirm={() => receivePurchaseOrder(receivingOrder.id)}
          onClose={() => setReceivingOrder(null)}
        />
      )}
    </PageContainer>
  );
}
