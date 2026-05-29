import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Upload,
  X,
  Download,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import {
  parseEntriesCsv,
  parseVerifikationCsv,
  detectCsvFormat,
  CSV_TEMPLATE,
  CATEGORY_REFERENCE,
  type ParsedImportEntry,
} from "../utils/csv-import";
import { formatAmount } from "../utils/format";

interface ImportEntriesDialogProps {
  onClose: () => void;
  onImport: (
    entries: ParsedImportEntry[]
  ) => Promise<{ successCount: number; errors: string[] }>;
}

type Step = "upload" | "preview" | "importing" | "done";

/**
 * Decodes raw CSV bytes to text. Tries strict UTF-8 first; if the bytes aren't
 * valid UTF-8 (common with Excel-on-Windows exports), falls back to
 * Windows-1252 so Swedish characters (å ä ö) survive.
 */
function decodeCsvBuffer(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

export function ImportEntriesDialog({
  onClose,
  onImport,
}: ImportEntriesDialogProps) {
  const { t } = useTranslation("accounting");
  const [step, setStep] = useState<Step>("upload");
  const [dragOver, setDragOver] = useState(false);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [parsedEntries, setParsedEntries] = useState<ParsedImportEntry[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [importTotal, setImportTotal] = useState(0);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [showCategories, setShowCategories] = useState(false);
  const [detectedFormat, setDetectedFormat] = useState<
    "verifikation" | "internal" | null
  >(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function downloadTemplate() {
    const blob = new Blob(["\uFEFF" + CSV_TEMPLATE], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "journal-entry-import-template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setParseErrors([t("import.errors.notCsv")]);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      const text = decodeCsvBuffer(buffer);
      const format = detectCsvFormat(text);

      if (format === "unknown") {
        setParseErrors([t("import.errors.unrecognizedFormat")]);
        return;
      }

      setDetectedFormat(format);
      const result =
        format === "verifikation"
          ? parseVerifikationCsv(text)
          : parseEntriesCsv(text);

      setParseErrors(result.errors);
      setParseWarnings(result.warnings);
      setParsedEntries(result.entries);
      if (result.errors.length === 0 && result.entries.length > 0) {
        setStep("preview");
      }
    };
    // Read as bytes so we can fall back from UTF-8 to Windows-1252, which is
    // what Excel on Windows commonly produces (and which mangles å/ä/ö under
    // a naive UTF-8 read).
    reader.readAsArrayBuffer(file);
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
    setImportTotal(parsedEntries.length);
    setImportProgress(0);
    setImportErrors([]);

    // Simulate progress while importing in batch
    const progressInterval = setInterval(() => {
      setImportProgress((p) => Math.min(p + 1, parsedEntries.length - 1));
    }, 80);

    try {
      const result = await onImport(parsedEntries);
      clearInterval(progressInterval);
      setImportProgress(parsedEntries.length);
      setImportErrors(result.errors);
    } catch (err) {
      clearInterval(progressInterval);
      setImportErrors([
        t("import.importFailed", {
          message: err instanceof Error ? err.message : t("import.unknownError"),
        }),
      ]);
    }

    setStep("done");
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
          <h2 className="text-lg font-semibold">
            {t("import.title")}
          </h2>
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
                  <p className="text-sm font-medium">{t("import.supportedFormats")}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {t("import.supportedFormatsIntro")}
                  </p>
                  <ul className="mt-1.5 space-y-0.5 text-sm text-muted-foreground list-disc list-inside">
                    <li>
                      <span className="text-foreground font-medium">
                        {t("import.crmFormat")}
                      </span>{" "}
                      {t("import.crmFormatDescription")}
                    </li>
                    <li>
                      <span className="text-foreground font-medium">
                        {t("import.verifikationsjournal")}
                      </span>{" "}
                      {t("import.verifikationsjournalDescription")}
                    </li>
                  </ul>
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
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        {t("import.columns.column")}
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        {t("import.columns.required")}
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        {t("import.columns.format")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["date", t("import.columns.requiredYes"), t("import.columns.date")],
                      [
                        "transactionType",
                        t("import.columns.requiredYes"),
                        t("import.columns.transactionType"),
                      ],
                      [
                        "category",
                        t("import.columns.requiredYes"),
                        t("import.columns.category"),
                      ],
                      [
                        "totalAmount",
                        t("import.columns.requiredYes"),
                        t("import.columns.totalAmount"),
                      ],
                      ["description", t("import.columns.requiredNo"), t("import.columns.description")],
                      [
                        "vatRate",
                        t("import.columns.requiredNo"),
                        t("import.columns.vatRate"),
                      ],
                    ].map(([col, req, fmt]) => (
                      <tr
                        key={col}
                        className="border-b border-border last:border-b-0"
                      >
                        <td className="px-3 py-2 font-mono">{col}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {req}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {fmt}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Category reference toggle */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowCategories((v) => !v)}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  {showCategories
                    ? t("import.hideCategories")
                    : t("import.showCategories")}
                </button>

                {showCategories && (
                  <div className="mt-2 rounded-lg border border-border overflow-x-auto text-xs">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-muted/30 border-b border-border">
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            {t("import.categoryColumnId")}
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            {t("import.categoryColumnName")}
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            {t("import.categoryColumnType")}
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                            {t("import.categoryColumnDefaultVat")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {CATEGORY_REFERENCE.map((cat) => (
                          <tr
                            key={cat.id}
                            className="border-b border-border last:border-b-0"
                          >
                            <td className="px-3 py-2 font-mono">{cat.id}</td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {cat.name}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={
                                  cat.type === "cost"
                                    ? "text-red-600"
                                    : "text-green-600"
                                }
                              >
                                {cat.type === "cost"
                                  ? t("import.categoryTypeCost")
                                  : t("import.categoryTypeIncome")}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {cat.defaultVatRate}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Drop zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
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
                <p className="text-sm font-medium">
                  {t("import.dropHere")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("import.clickToSelect")}
                </p>
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
                      <li key={i} className="text-sm text-red-600">
                        {e}
                      </li>
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
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {parsedEntries.length}
                    </span>{" "}
                    {t("import.foundInFile", { count: parsedEntries.length })}
                  </p>
                  {detectedFormat && (
                    <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
                      {detectedFormat === "verifikation"
                        ? t("import.verifikationsjournal")
                        : t("import.crmFormat")}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStep("upload");
                    setParsedEntries([]);
                    setParseErrors([]);
                    setParseWarnings([]);
                    setDetectedFormat(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
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
                      <li key={i} className="text-sm text-yellow-700">
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Preview table */}
              <div className="overflow-x-auto rounded-lg border border-border text-sm">
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        {t("import.previewColumns.date")}
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        {t("import.previewColumns.description")}
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        {t("import.previewType")}
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                        {t("import.previewColumns.category")}
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                        {t("import.previewAmountIncl")}
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                        {t("import.previewVat")}
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                        {t("import.previewVatRate")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedEntries.map((entry, i) => (
                      <tr
                        key={i}
                        className="border-b border-border last:border-b-0"
                      >
                        <td className="px-3 py-2 text-muted-foreground">
                          {entry.date}
                        </td>
                        <td className="px-3 py-2 max-w-[180px] truncate">
                          {entry.description}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={
                              entry.transactionType === "cost"
                                ? "text-red-600"
                                : "text-green-600"
                            }
                          >
                            {entry.transactionType === "cost"
                              ? t("import.previewTypeCost")
                              : t("import.previewTypeIncome")}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground text-xs font-mono">
                          {entry.category}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {formatAmount(entry.totalAmount)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {formatAmount(entry.vatAmount)}
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {entry.vatRate}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {parsedEntries.length > 0 && (
                    <tfoot>
                      <tr className="bg-muted/30 border-t border-border">
                        <td
                          colSpan={4}
                          className="px-3 py-2 text-sm font-medium text-muted-foreground"
                        >
                          {t("import.previewTotal")}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {formatAmount(
                            parsedEntries.reduce(
                              (s, e) => s + e.totalAmount,
                              0
                            )
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-muted-foreground">
                          {formatAmount(
                            parsedEntries.reduce((s, e) => s + e.vatAmount, 0)
                          )}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </>
          )}

          {/* Step: Importing */}
          {step === "importing" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium">
                {t("import.importingProgress", {
                  current: importProgress,
                  total: importTotal,
                })}
              </p>
              <div className="w-full max-w-xs rounded-full bg-muted h-2 overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{
                    width: `${importTotal > 0 ? (importProgress / importTotal) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Step: Done */}
          {step === "done" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
              <p className="text-base font-semibold">
                {t("import.doneSummary", {
                  imported: importTotal - importErrors.length,
                  total: importTotal,
                  count: importTotal,
                })}
              </p>
              {importErrors.length > 0 && (
                <div className="w-full rounded-lg border border-red-200 bg-red-50 p-4 space-y-1">
                  <p className="text-sm font-medium text-red-700">
                    {t("import.importErrorsTitle")}
                  </p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {importErrors.map((e, i) => (
                      <li key={i} className="text-sm text-red-600">
                        {e}
                      </li>
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
                {t("import.importButton", { count: parsedEntries.length })}
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
