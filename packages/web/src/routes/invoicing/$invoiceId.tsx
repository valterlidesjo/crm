import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageContainer } from "@/components/layout/page-container";
import { InvoiceForm } from "@/features/invoices/components/invoice-form";
import { CancelInvoiceDialog } from "@/features/invoices/components/cancel-invoice-dialog";
import { useInvoices } from "@/features/invoices/hooks/use-invoices";
import { requireAdmin } from "@/lib/route-guards";
import { ArrowLeft, Send, CheckCircle, XCircle } from "lucide-react";

export const Route = createFileRoute("/invoicing/$invoiceId")({
  beforeLoad: ({ context }) => requireAdmin(context.auth),
  component: InvoiceDetailPage,
});

function InvoiceDetailPage() {
  const { t } = useTranslation("invoices");
  const { invoiceId } = Route.useParams();
  const navigate = useNavigate();
  const { invoices, loading, updateInvoice, cancelInvoice, markAsPaid } = useInvoices();
  const [updating, setUpdating] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const invoice = useMemo(
    () => invoices.find((inv) => inv.id === invoiceId),
    [invoices, invoiceId]
  );

  async function handleMarkSent() {
    if (!invoice) return;
    setUpdating(true);
    try {
      await updateInvoice(invoice.id, { status: "sent" });
    } finally {
      setUpdating(false);
    }
  }

  async function handleMarkPaid() {
    if (!invoice) return;
    setUpdating(true);
    try {
      await markAsPaid(invoice.id, invoice);
    } finally {
      setUpdating(false);
    }
  }

  async function handleCancel(reason: string) {
    if (!invoice) return;
    await cancelInvoice(invoice.id, reason);
    navigate({ to: "/invoicing" });
  }

  if (loading) {
    return (
      <PageContainer title={t("detail.invoice")}>
        <p className="text-sm text-muted-foreground">{t("detail.loading")}</p>
      </PageContainer>
    );
  }

  if (!invoice) {
    return (
      <PageContainer title={t("detail.invoice")}>
        <p className="text-sm text-muted-foreground">{t("detail.notFound")}</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title={t("detail.pageTitle", { number: invoice.invoiceNumber })}
      description={t("detail.pageDescription")}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate({ to: "/invoicing" })}
            className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("detail.back")}
          </button>

          <div className="flex items-center gap-3">
            {invoice.status === "paid" && (
              <span className="inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                {t("status.paid")}
              </span>
            )}

            {(invoice.status === "created" || invoice.status === "draft") && (
              <button
                type="button"
                onClick={handleMarkSent}
                disabled={updating}
                className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {updating ? t("detail.updating") : t("detail.markAsSent")}
              </button>
            )}

            {invoice.status === "sent" && (
              <button
                type="button"
                onClick={handleMarkPaid}
                disabled={updating}
                className="flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                <CheckCircle className="h-4 w-4" />
                {updating ? t("detail.updating") : t("detail.markAsPaid")}
              </button>
            )}

            {(invoice.status === "draft" ||
              invoice.status === "created" ||
              invoice.status === "sent" ||
              invoice.status === "overdue") && (
              <button
                type="button"
                onClick={() => setShowCancelDialog(true)}
                disabled={updating}
                className="flex items-center gap-1.5 rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <XCircle className="h-4 w-4" />
                {t("detail.cancelInvoice")}
              </button>
            )}
          </div>
        </div>

        <InvoiceForm
          existingInvoice={invoice}
          onSaved={() => navigate({ to: "/invoicing" })}
        />
      </div>

      <CancelInvoiceDialog
        open={showCancelDialog}
        onOpenChange={setShowCancelDialog}
        invoiceNumber={invoice.invoiceNumber}
        onConfirm={handleCancel}
      />
    </PageContainer>
  );
}
