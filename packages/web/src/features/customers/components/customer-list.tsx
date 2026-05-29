import { useTranslation } from "react-i18next";
import type { CustomerStatusType } from "@crm/shared";
import type { Customer } from "@crm/shared";
import { Pencil, Building2, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface CustomerListProps {
  customers: Customer[];
  loading: boolean;
  onEdit: (customer: Customer) => void;
}

const STATUS_COLORS: Record<CustomerStatusType, string> = {
  not_contacted: "bg-gray-100 text-gray-700",
  contacted: "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  warm: "bg-orange-100 text-orange-700",
  mrr: "bg-green-100 text-green-700",
  completed: "bg-emerald-100 text-emerald-700",
  lost: "bg-red-100 text-red-700",
};

export function CustomerList({ customers, loading, onEdit }: CustomerListProps) {
  const { t } = useTranslation("customers");

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t("list.loading")}</p>;
  }

  if (customers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground">{t("list.emptyTitle")}</p>
        <p className="text-sm text-muted-foreground">{t("list.emptyHint")}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("list.headers.name")}</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("list.headers.location")}</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("list.headers.email")}</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("list.headers.phone")}</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("list.headers.category")}</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">{t("list.headers.status")}</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">{t("list.headers.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => (
            <tr
              key={customer.id}
              className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors"
            >
              <td className="px-4 py-3 font-medium">
                <span className="flex items-center gap-1.5">
                  {customer.customerType === "private"
                    ? <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    : <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  }
                  {customer.name}
                </span>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{customer.location}</td>
              <td className="px-4 py-3 text-muted-foreground">{customer.email}</td>
              <td className="px-4 py-3 text-muted-foreground">{customer.phone}</td>
              <td className="px-4 py-3 text-muted-foreground">{customer.categoryOfWork}</td>
              <td className="px-4 py-3">
                <span
                  className={cn(
                    "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium",
                    STATUS_COLORS[customer.status]
                  )}
                >
                  {t(`status.${customer.status}`)}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => onEdit(customer)}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title={t("list.editTooltip")}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {t("list.edit")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
