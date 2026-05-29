import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Upload, X, Download, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { currentLocale } from "@/i18n";
import type { Customer } from "@crm/shared";
import {
  parseCsvInvoices,
  buildFormDataFromImport,
  CSV_TEMPLATE,
  type ParsedImportInvoice,
} from "../utils/csv-import";
import { useInvoices, generateInvoiceRef } from "../hooks/use-invoices";
import { usePartner } from "@/lib/partner";
import { generateInvoiceNumber } from "../hooks/use-invoices";

interface ImportInvoicesDialogProps {
  customers: Customer[];
  onClose: () => void;
  onImported: (count: number) => void;
}

type Step = "upload" | "preview" | "importing" | "done";

export function ImportInvoicesDialog({
  customers,
  onClose,
  onImported,
}: ImportInvoicesDialogProps) {
  const { t } = useTranslation("invoices");
  const { addInvoice } = useInvoices();
  const { partnerId } = usePartner();

  const [step, setStep] = useState<Step>("upload");
  const [dragOver, setDragOver] = useState(false);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [parsedInvoices, setParsedInvoices] = useState<ParsedImportInvoice[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  function downloadTemplate() {
    const blob = new Blob(["\uFEFF" + CSV_TEMPLATE], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "invoice-import-template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handleFile(file: File) {
    if (!file.name.endsWith(".csv")) {
      setParseErrors([t("import.errors.notCsv")]);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const result = parseCsvInvoices(text, customers);
      setParseErrors(result.errors);
      setParseWarnings(result.warnings);
      setParsedInvoices(result.invoices);
      if (result.errors.length === 0 && result.invoices.length > 0) {
        setStep("preview");
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  async function handleImport() {
    setStep("importing");
    setImportTotal(parsedInvoices.length);
    setImportProgress(0);
    setImportErrors([]);

    const errs: string[] = [];

    for (let i = 0; i < parsedInvoices.length; i++) {
      const inv = parsedInvoices[i];
      try {
        const invoiceNumber = inv.invoiceNumber || (await generateInvoiceNumber(partnerId));
        const ref = generateInvoiceRef();
        const formData = buildFormDataFromImport(inv, invoiceNumber);
        await addInvoice({ ...formData, invoiceRef: ref });
      } catch (err) {
        errs.push(
          t("import.errors.importRow", {
            index: i + 1,
            customer: inv.customerName,
            message: err instanceof Error ? err.message : t("import.errors.unknownError"),
          })
        );
      }
      setImportProgress(i + 1);
    }

    setImportErrors(errs);
    setStep("done");
    onImported(parsedInvoices.length - errs.length);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={step === "importing" ? undefined : onClose}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-3xl rounded-xl border border-border bg-background shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <h2 className="text-lg font-semibold">{t("import.title")}</h2>
          {step !== "importing" && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {/* Step: Upload */}
          {step === "upload" && (
            <>
              {/* Template download */}
              <div className="rounded-lg border border-border bg-muted/30 p-4 flex items-start gap-3">
                <Download className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{t("import.templateTitle")}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {t("import.templateDescriptionPrefix")}{" "}
                    <code className="text-xs bg-muted px-1 rounded">invoiceNumber</code> {t("import.templateDescriptionSuffix")}
                  </p>
                  <button
                    type="button"
                    onClick={downloadTemplate}
                    className="mt-2 text-sm font-medium text-primary hover:underline"
                  >
                    {t("import.downloadTemplate")}
                  </button>
                </div>
              </div>

              {/* Column reference */}
              <div className="rounded-lg border border-border overflow-x-auto text-xs">
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">{t("import.columnHeaders.column")}</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">{t("import.columnHeaders.required")}</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">{t("import.columnHeaders.format")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["invoiceDate", true],
                        ["dueDate", true],
                        ["customerName", true],
                        ["description", true],
                        ["quantity", false],
                        ["unitPrice", false],
                        ["vatRate", false],
                        ["invoiceNumber", false],
                        ["currency", false],
                        ["overdueInterestRate", false],
                        ["notes", false],
                        ["isInternational", false],
                        ["language", false],
                      ] as const
                    ).map(([col, required]) => (
                      <tr key={col} className="border-b border-border last:border-b-0">
                        <td className="px-3 py-2 font-mono">{col}</td>
                        <td className="px-3 py-2 text-muted-foreground">{required ? t("import.required.yes") : t("import.required.no")}</td>
                        <td className="px-3 py-2 text-muted-foreground">{t(`import.columnDescriptions.${col}`)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                className={`cursor-pointer rounded-lg border-2 border-dashed p-10 flex flex-col items-center gap-3 transition-colors ${
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-muted/20"
                }`}
              >
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">{t("import.dropHere")}</p>
                <p className="text-xs text-muted-foreground">{t("import.clickToSelect")}</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={onFileChange}
                />
              </div>

              {/* Parse errors */}
              {parseErrors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-1">
                  <p className="text-sm font-medium text-red-700 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" /> {t("import.errorsTitle")}
                  </p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {parseErrors.map((e, i) => (
                      <li key={i} className="text-sm text-red-600">{e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {/* Step: Preview */}
          {step === "preview" && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {t("import.found", { count: parsedInvoices.length })}
                </p>
                <button
                  type="button"
                  onClick={() => { setStep("upload"); setParsedInvoices([]); setParseErrors([]); setParseWarnings([]); if (fileRef.current) fileRef.current.value = ""; }}
                  className="text-sm text-muted-foreground hover:text-foreground underline"
                >
                  {t("import.changeFile")}
                </button>
              </div>

              {/* Warnings */}
              {parseWarnings.length > 0 && (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 space-y-1">
                  <p className="text-sm font-medium text-yellow-700 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" /> {t("import.warningsTitle")}
                  </p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {parseWarnings.map((w, i) => (
                      <li key={i} className="text-sm text-yellow-700">{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Preview table */}
              <div className="overflow-x-auto rounded-lg border border-border text-sm">
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">{t("import.previewColumns.date")}</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">{t("import.previewColumns.customer")}</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">{t("import.previewColumns.invoiceNumber")}</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">{t("import.previewColumns.lines")}</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">{t("import.previewColumns.exclVat")}</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">{t("import.previewColumns.vat")}</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">{t("import.previewColumns.total")}</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">{t("import.previewColumns.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedInvoices.map((inv, i) => (
                      <tr key={i} className="border-b border-border last:border-b-0">
                        <td className="px-3 py-2 text-muted-foreground">{inv.invoiceDate}</td>
                        <td className="px-3 py-2">
                          <span className={inv.customerId ? "" : "text-yellow-600"}>
                            {inv.customerName}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                          {inv.invoiceNumber || <span className="italic">{t("import.auto")}</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{inv.items.length}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {inv.subtotal.toLocaleString(currentLocale(), { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {inv.vatAmount.toLocaleString(currentLocale(), { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {inv.totalAmount.toLocaleString(currentLocale(), { minimumFractionDigits: 2 })} {inv.currency}
                        </td>
                        <td className="px-3 py-2">
                          {inv.customerId ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-700">
                              <CheckCircle2 className="h-3.5 w-3.5" /> {t("import.ok")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-yellow-600">
                              <AlertTriangle className="h-3.5 w-3.5" /> {t("import.customerMissing")}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {parsedInvoices.length > 0 && (
                    <tfoot>
                      <tr className="bg-muted/30 border-t border-border">
                        <td colSpan={4} className="px-3 py-2 text-sm font-medium text-muted-foreground">{t("import.totalRow")}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {parsedInvoices.reduce((s, inv) => s + inv.subtotal, 0).toLocaleString(currentLocale(), { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-muted-foreground">
                          {parsedInvoices.reduce((s, inv) => s + inv.vatAmount, 0).toLocaleString(currentLocale(), { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {parsedInvoices.reduce((s, inv) => s + inv.totalAmount, 0).toLocaleString(currentLocale(), { minimumFractionDigits: 2 })}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {parsedInvoices.some((inv) => !inv.customerId) && (
                <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
                  {t("import.unmatchedNotice")}
                </p>
              )}
            </>
          )}

          {/* Step: Importing */}
          {step === "importing" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium">
                {t("import.progress", { current: importProgress, total: importTotal })}
              </p>
              <div className="w-full max-w-xs rounded-full bg-muted h-2 overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${importTotal > 0 ? (importProgress / importTotal) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {/* Step: Done */}
          {step === "done" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
              <p className="text-base font-semibold">
                {t("import.doneSummary", { imported: importTotal - importErrors.length, total: importTotal })}
              </p>
              {importErrors.length > 0 && (
                <div className="w-full rounded-lg border border-red-200 bg-red-50 p-4 space-y-1">
                  <p className="text-sm font-medium text-red-700">{t("import.importErrorsTitle")}</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {importErrors.map((e, i) => (
                      <li key={i} className="text-sm text-red-600">{e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4 flex justify-end gap-3 shrink-0">
          {step === "upload" && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              {t("import.cancel")}
            </button>
          )}
          {step === "preview" && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
              >
                {t("import.cancel")}
              </button>
              <button
                type="button"
                onClick={handleImport}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {t("import.import", { count: parsedInvoices.length })}
              </button>
            </>
          )}
          {step === "done" && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {t("import.close")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
