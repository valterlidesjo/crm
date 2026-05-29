import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import { currentLocale } from "@/i18n";
import type { ShopifyOrder, ShopifyOrderStatus } from "@crm/shared";

const STATUS_STYLES: Record<ShopifyOrderStatus, string> = {
  pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
  paid: "bg-blue-50 text-blue-700 border-blue-200",
  fulfilled: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-gray-50 text-gray-500 border-gray-200",
  refunded: "bg-red-50 text-red-700 border-red-200",
};

function StatusBadge({ status }: { status: ShopifyOrderStatus }) {
  const { t } = useTranslation("orders");
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {t(`status.${status}`)}
    </span>
  );
}

const SOURCE_STYLES: Record<string, string> = {
  shopify: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cdon: "bg-violet-50 text-violet-700 border-violet-200",
};

function SourceBadge({ source }: { source?: string }) {
  const key = source ?? "shopify";
  const label = key === "cdon" ? "CDON" : "Shopify";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${SOURCE_STYLES[key] ?? SOURCE_STYLES.shopify}`}>
      {label}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatPrice(amount: number, currency: string) {
  return new Intl.NumberFormat(currentLocale(), { style: "currency", currency }).format(amount);
}

function OrderRow({ order }: { order: ShopifyOrder }) {
  const { t } = useTranslation("orders");
  const [expanded, setExpanded] = useState(false);
  const isCancelled = order.status === "cancelled";

  return (
    <>
      <tr
        className={`border-b border-border transition-colors hover:bg-muted/40 cursor-pointer ${isCancelled ? "opacity-60" : ""}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            <span className="font-medium text-sm">{order.orderNumber}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-sm">
          <SourceBadge source={order.source} />
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(order.createdAt)}</td>
        <td className="px-4 py-3">
          <StatusBadge status={order.status} />
        </td>
        <td className="px-4 py-3 text-sm">{order.customerName ?? "—"}</td>
        <td className="px-4 py-3 text-sm text-right font-medium">
          {formatPrice(order.totalPrice, order.currency)}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border bg-muted/20">
          <td colSpan={6} className="px-8 py-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="pb-1 text-left font-medium">{t("lineItems.product")}</th>
                  <th className="pb-1 text-left font-medium">{t("lineItems.variant")}</th>
                  <th className="pb-1 text-left font-medium">{t("lineItems.sku")}</th>
                  <th className="pb-1 text-right font-medium">{t("lineItems.qty")}</th>
                  <th className="pb-1 text-right font-medium">{t("lineItems.unitPrice")}</th>
                </tr>
              </thead>
              <tbody>
                {order.lineItems.map((li, i) => (
                  <tr key={i}>
                    <td className="py-0.5">{li.productTitle}</td>
                    <td className="py-0.5 text-muted-foreground">{li.variantTitle ?? "—"}</td>
                    <td className="py-0.5 text-muted-foreground font-mono">{li.sku ?? "—"}</td>
                    <td className="py-0.5 text-right">{li.quantity}</td>
                    <td className="py-0.5 text-right">{formatPrice(li.price, order.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

// `labelKey` is "all" → orders:filter.allStatuses, otherwise a key under orders:status.
const STATUS_OPTIONS: Array<{ value: ShopifyOrderStatus | "all"; labelKey: string }> = [
  { value: "all", labelKey: "filter.allStatuses" },
  { value: "pending", labelKey: "status.pending" },
  { value: "paid", labelKey: "status.paid" },
  { value: "fulfilled", labelKey: "status.fulfilled" },
  { value: "cancelled", labelKey: "status.cancelled" },
  { value: "refunded", labelKey: "status.refunded" },
];

interface OrdersTableProps {
  orders: ShopifyOrder[];
  loading: boolean;
  statusFilter: ShopifyOrderStatus | "all";
  onStatusFilter: (v: ShopifyOrderStatus | "all") => void;
}

export function OrdersTable({ orders, loading, statusFilter, onStatusFilter }: OrdersTableProps) {
  const { t } = useTranslation("orders");
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground">{t("filter.statusLabel")}</label>
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilter(e.target.value as ShopifyOrderStatus | "all")}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("states.loading")}</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("states.empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("table.order")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("table.source")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("table.date")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("table.status")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("table.customer")}</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("table.total")}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <OrderRow key={order.id} order={order} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
