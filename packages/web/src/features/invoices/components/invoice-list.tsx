import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import type { Invoice, Customer } from "@crm/shared";
import { cn } from "@/lib/utils";
import { currentLocale } from "@/i18n";
import { ChevronRight, ChevronDown, Trash2, Pencil } from "lucide-react";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  created: "bg-yellow-100 text-yellow-700",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  cancelled: "bg-muted text-muted-foreground",
};

interface InvoiceListProps {
  invoices: Invoice[];
  customers: Customer[];
  onDelete: (id: string) => Promise<void>;
}

export function InvoiceList({ invoices, customers, onDelete }: InvoiceListProps) {
  const { t } = useTranslation("invoices");
  const navigate = useNavigate();
  const [cancelledExpanded, setCancelledExpanded] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const active = invoices.filter((inv) => inv.status !== "cancelled");
  const cancelled = invoices.filter((inv) => inv.status === "cancelled");

  const customerMap = useMemo(
    () => new Map(customers.map((c) => [c.id, c.name])),
    [customers]
  );
  const customerName = (id: string) =>
    customerMap.get(id) ?? t("list.unknownCustomer");

  function navigateToInvoice(id: string) {
    navigate({ to: "/invoicing/$invoiceId", params: { invoiceId: id } });
  }

  const deleteTarget = invoices.find((inv) => inv.id === deleteTargetId);

  const tableHeader = (
    <tr className="border-b border-border bg-muted/30">
      <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">{t("list.columns.invoiceNumber")}</th>
      <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">{t("list.columns.reference")}</th>
      <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">{t("list.columns.customer")}</th>
      <th className="py-2.5 px-4 text-right font-medium text-muted-foreground">{t("list.columns.total")}</th>
      <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">{t("list.columns.status")}</th>
      <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">{t("list.columns.dueDate")}</th>
      <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">{t("list.columns.created")}</th>
      <th className="py-2.5 px-4" />
    </tr>
  );

  if (invoices.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("list.empty")}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {active.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("list.noActive")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>{tableHeader}</thead>
            <tbody>
              {active.map((inv) => (
                <tr
                  key={inv.id}
                  onClick={() => navigateToInvoice(inv.id)}
                  className="border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer"
                >
                  <td className="py-2.5 px-4 font-medium">{inv.invoiceNumber}</td>
                  <td className="py-2.5 px-4 font-mono text-xs">{inv.invoiceRef}</td>
                  <td className="py-2.5 px-4">{customerName(inv.customerId)}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums">
                    {inv.totalAmount.toLocaleString(currentLocale(), { minimumFractionDigits: 2 })}{" "}
                    {inv.currency}
                  </td>
                  <td className="py-2.5 px-4">
                    <span
                      className={cn(
                        "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium",
                        STATUS_COLORS[inv.status] ?? STATUS_COLORS.draft
                      )}
                    >
                      {t(`status.${inv.status}`)}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-muted-foreground">{inv.dueDate}</td>
                  <td className="py-2.5 px-4 text-muted-foreground">
                    {inv.createdAt.slice(0, 10)}
                  </td>
                  <td className="py-2.5 px-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => navigateToInvoice(inv.id)}
                        className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        {t("list.edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTargetId(inv.id)}
                        className="flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t("list.delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cancelled.length > 0 && (
        <div className="rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setCancelledExpanded((v) => !v)}
            className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {cancelledExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <span className="h-2.5 w-2.5 rounded-full bg-gray-400" />
            {t("list.cancelledGroup", { count: cancelled.length })}
          </button>

          {cancelledExpanded && (
            <div className="border-t border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">{t("list.columns.invoiceNumber")}</th>
                    <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">{t("list.columns.reference")}</th>
                    <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">{t("list.columns.customer")}</th>
                    <th className="py-2.5 px-4 text-right font-medium text-muted-foreground">{t("list.columns.total")}</th>
                    <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">{t("list.columns.reason")}</th>
                    <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">{t("list.columns.cancelled")}</th>
                    <th className="py-2.5 px-4" />
                  </tr>
                </thead>
                <tbody>
                  {cancelled.map((inv) => (
                    <tr key={inv.id} className="border-b border-border last:border-b-0">
                      <td
                        className="py-2.5 px-4 font-medium cursor-pointer hover:underline"
                        onClick={() => navigateToInvoice(inv.id)}
                      >
                        {inv.invoiceNumber}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-xs">{inv.invoiceRef}</td>
                      <td className="py-2.5 px-4">{customerName(inv.customerId)}</td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-muted-foreground">
                        {inv.totalAmount.toLocaleString(currentLocale(), { minimumFractionDigits: 2 })}{" "}
                        {inv.currency}
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground max-w-xs truncate">
                        {inv.cancellationReason ?? "—"}
                      </td>
                      <td className="py-2.5 px-4 text-muted-foreground">
                        {inv.updatedAt.slice(0, 10)}
                      </td>
                      <td className="py-2.5 px-4">
                        <button
                          type="button"
                          onClick={() => setDeleteTargetId(inv.id)}
                          className="flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {t("list.delete")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <DeleteConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}
        title={t("list.deleteTitle", { number: deleteTarget?.invoiceNumber ?? "" })}
        description={t("list.deleteDescription")}
        onConfirm={() => onDelete(deleteTargetId!)}
      />
    </div>
  );
}
