import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageContainer } from "@/components/layout/page-container";
import { OrdersTable } from "@/features/orders/components/orders-table";
import { useOrders } from "@/features/orders/hooks/use-orders";
import type { ShopifyOrderStatus } from "@crm/shared";

export const Route = createFileRoute("/orders/")({
  component: OrdersPage,
});

function OrdersPage() {
  const { t } = useTranslation("orders");
  const [statusFilter, setStatusFilter] = useState<ShopifyOrderStatus | "all">("all");
  const { orders, loading } = useOrders(statusFilter === "all" ? undefined : statusFilter);

  return (
    <PageContainer
      title={t("page.title")}
      description={t("page.description")}
    >
      <OrdersTable
        orders={orders}
        loading={loading}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
      />
    </PageContainer>
  );
}
