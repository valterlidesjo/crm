import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import type { Quote, Customer } from "@crm/shared";
import { currentLocale } from "@/i18n";
import { cn } from "@/lib/utils";
import { FileText, Pencil, Trash2 } from "lucide-react";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  created: "bg-yellow-100 text-yellow-700",
  sent: "bg-blue-100 text-blue-700",
  accepted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

interface QuoteListProps {
  quotes: Quote[];
  customers: Customer[];
  onDelete: (id: string) => Promise<void>;
  onConvert: (quote: Quote) => Promise<void>;
}

export function QuoteList({ quotes, customers, onDelete, onConvert }: QuoteListProps) {
  const { t } = useTranslation("quotes");
  const navigate = useNavigate();
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const customerMap = useMemo(
    () => new Map(customers.map((c) => [c.id, c.name])),
    [customers]
  );
  const customerName = (id: string) => customerMap.get(id) ?? t("list.unknownCustomer");

  const deleteTarget = quotes.find((q) => q.id === deleteTargetId);

  if (quotes.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("list.empty")}
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">{t("list.columns.quoteNumber")}</th>
              <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">{t("list.columns.customer")}</th>
              <th className="py-2.5 px-4 text-right font-medium text-muted-foreground">{t("list.columns.total")}</th>
              <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">{t("list.columns.status")}</th>
              <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">{t("list.columns.validUntil")}</th>
              <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">{t("list.columns.created")}</th>
              <th className="py-2.5 px-4" />
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr
                key={q.id}
                onClick={() =>
                  navigate({ to: "/quotes/$quoteId", params: { quoteId: q.id } })
                }
                className="border-b border-border last:border-b-0 cursor-pointer hover:bg-muted/20 transition-colors"
              >
                <td className="py-2.5 px-4 font-medium">{q.quoteNumber}</td>
                <td className="py-2.5 px-4">{customerName(q.customerId)}</td>
                <td className="py-2.5 px-4 text-right tabular-nums">
                  {q.totalAmount.toLocaleString(currentLocale(), { minimumFractionDigits: 2 })}{" "}
                  {q.currency}
                </td>
                <td className="py-2.5 px-4">
                  <span
                    className={cn(
                      "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium",
                      STATUS_COLORS[q.status] ?? STATUS_COLORS.draft
                    )}
                  >
                    {t(`status.${q.status}`)}
                  </span>
                </td>
                <td className="py-2.5 px-4 text-muted-foreground">{q.validUntil}</td>
                <td className="py-2.5 px-4 text-muted-foreground">
                  {q.createdAt.slice(0, 10)}
                </td>
                <td className="py-2.5 px-4" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        navigate({ to: "/quotes/$quoteId", params: { quoteId: q.id } })
                      }
                      className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {t("list.edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => onConvert(q)}
                      className="flex items-center gap-1.5 rounded-md border border-blue-200 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {t("list.convert")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTargetId(q.id)}
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

      <DeleteConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}
        title={t("list.deleteTitle", { number: deleteTarget?.quoteNumber ?? "" })}
        description={t("list.deleteDescription")}
        onConfirm={() => onDelete(deleteTargetId!)}
      />
    </>
  );
}
