import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createFileRoute } from "@tanstack/react-router";
import { PageContainer } from "@/components/layout/page-container";
import { InvoiceForm } from "@/features/invoices/components/invoice-form";
import { InvoiceList } from "@/features/invoices/components/invoice-list";
import { ImportInvoicesDialog } from "@/features/invoices/components/import-invoices-dialog";
import { ExportInvoicesDialog } from "@/features/invoices/components/export-invoices-dialog";
import { useInvoices } from "@/features/invoices/hooks/use-invoices";
import { useCustomers } from "@/features/customers/hooks/use-customers";
import { requireAdmin } from "@/lib/route-guards";
import { Plus, X, Upload, Download } from "lucide-react";

export const Route = createFileRoute("/invoicing/")({
  beforeLoad: ({ context }) => requireAdmin(context.auth),
  component: InvoicingPage,
});

function InvoicingPage() {
  const { t } = useTranslation("invoices");
  const { invoices, loading, deleteInvoice } = useInvoices();
  const { customers } = useCustomers();
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);

  return (
    <PageContainer title={t("page.title")} description={t("page.description")}>
      <div className="space-y-6">
        {/* Action bar */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            <Upload className="h-4 w-4" /> {t("page.importCsv")}
          </button>

          <button
            type="button"
            onClick={() => setShowExport(true)}
            disabled={invoices.length === 0}
            className="flex items-center gap-1.5 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> {t("page.exportCsv")}
          </button>

          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {showForm ? (
              <>
                <X className="h-4 w-4" /> {t("page.close")}
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" /> {t("page.newInvoice")}
              </>
            )}
          </button>
        </div>

        {showForm && (
          <div className="rounded-lg border border-border bg-background p-6">
            <h2 className="mb-4 text-lg font-semibold">{t("detail.newInvoice")}</h2>
            <InvoiceForm onSaved={() => setShowForm(false)} />
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">{t("page.loading")}</p>
        ) : (
          <InvoiceList invoices={invoices} customers={customers} onDelete={deleteInvoice} />
        )}
      </div>

      {/* Dialogs */}
      {showImport && (
        <ImportInvoicesDialog
          customers={customers}
          onClose={() => setShowImport(false)}
          onImported={() => setShowImport(false)}
        />
      )}

      {showExport && (
        <ExportInvoicesDialog
          invoices={invoices}
          customers={customers}
          onClose={() => setShowExport(false)}
        />
      )}
    </PageContainer>
  );
}
