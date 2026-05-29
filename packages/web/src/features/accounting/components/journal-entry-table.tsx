import type { JournalEntry, JournalEntrySource } from "@crm/shared";
import { ACCOUNT_CATEGORIES } from "@crm/shared";
import { Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { formatAmount } from "../utils/format";

interface JournalEntryTableProps {
  entries: JournalEntry[];
  onEdit: (entry: JournalEntry) => void;
  onDelete: (entry: JournalEntry) => void;
}

function getCategoryName(categoryId: string): string {
  return ACCOUNT_CATEGORIES.find((c) => c.id === categoryId)?.name ?? categoryId;
}

const SOURCE_LABEL_KEYS: Record<JournalEntrySource, string> = {
  manual: "entries.source.manual",
  import: "entries.source.import",
  invoice: "entries.source.invoice",
  "purchase-order": "entries.source.purchaseOrder",
  shopify: "entries.source.shopify",
};

function SourceBadge({ source }: { source: JournalEntry["source"] }) {
  const { t } = useTranslation("accounting");
  // Legacy entries with no source are treated as manual.
  const key: JournalEntrySource = source ?? "manual";
  if (key === "manual") return null;
  return (
    <span className="ml-2 rounded-full border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground align-middle">
      {t(SOURCE_LABEL_KEYS[key])}
    </span>
  );
}

export function JournalEntryTable({
  entries,
  onEdit,
  onDelete,
}: JournalEntryTableProps) {
  const { t } = useTranslation("accounting");
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-border p-8 text-center text-muted-foreground">
        {t("entries.empty")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full">
        <thead className="border-b border-border">
          <tr className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 text-left">{t("entries.columnDate")}</th>
            <th className="px-3 py-2 text-left">{t("entries.columnDescription")}</th>
            <th className="px-3 py-2 text-left">{t("entries.columnCategory")}</th>
            <th className="px-3 py-2 text-right">{t("entries.columnAmount")}</th>
            <th className="w-16 px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const isCost = entry.transactionType === "cost";
            return (
              <tr
                key={entry.id}
                className="border-b border-border last:border-0 hover:bg-muted/40"
              >
                <td className="whitespace-nowrap px-3 py-2 text-sm text-muted-foreground">
                  {entry.date}
                </td>
                <td className="px-3 py-2 text-sm">
                  {entry.description || "—"}
                  <SourceBadge source={entry.source} />
                </td>
                <td className="px-3 py-2 text-sm text-muted-foreground">
                  {getCategoryName(entry.category)}
                </td>
                <td
                  className={cn(
                    "whitespace-nowrap px-3 py-2 text-right text-sm font-medium tabular-nums",
                    isCost ? "text-red-600" : "text-green-600"
                  )}
                >
                  {isCost ? "−" : "+"}
                  {formatAmount(entry.totalAmount)} kr
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onEdit(entry)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      title={t("entries.editTitle")}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(entry)}
                      className="rounded p-1 text-muted-foreground hover:bg-red-100 hover:text-red-600 transition-colors"
                      title={t("entries.deleteTitle")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
