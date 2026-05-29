import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Plus, UserPlus, Type } from "lucide-react";
import { useCustomers } from "@/features/customers/hooks/use-customers";
import { AddCustomerDialog } from "@/features/customers/components/add-customer-dialog";
import { useCompanyProfile } from "@/features/profile/hooks/use-profile";
import { useQuotes, type QuoteFormData } from "../hooks/use-quotes";
import { QuoteLineItem } from "./quote-line-item";
import { ProfitabilityCard } from "./profitability-card";
import { calcQuoteTotals, type QuoteLineData, type CostEntry } from "../utils/calculations";
import { generateQuotePdf } from "../utils/generate-quote-pdf";
import { fetchLogoDataUrl } from "@/lib/logo-data-url";
import { useProductSuggestions } from "@/features/invoices/hooks/use-product-suggestions";
import { currentLocale } from "@/i18n";
import type { VatRateType, BillingFrequency, Quote, Customer } from "@crm/shared";

const INPUT_CLASS =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors";

function emptyLine(): QuoteLineData {
  return { type: "article", description: "", quantity: 1, unitPrice: 0, vatRate: "25", billingFrequency: "one-time" };
}

function emptyTextLine(): QuoteLineData {
  return { type: "text", description: "", quantity: 0, unitPrice: 0, vatRate: "25", billingFrequency: "one-time" };
}

function defaultValidUntil(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

interface QuoteFormProps {
  existingQuote?: Quote;
  onSaved?: () => void;
}

export function QuoteForm({ existingQuote, onSaved }: QuoteFormProps) {
  const { t } = useTranslation("quotes");
  const { customers, addCustomer } = useCustomers();
  const { profile } = useCompanyProfile();
  const { addQuote, updateQuote, generateQuoteNumber } = useQuotes();
  const { suggestions } = useProductSuggestions();
  const [showAddCustomer, setShowAddCustomer] = useState(false);

  const [customerId, setCustomerId] = useState(
    existingQuote?.customerId ?? ""
  );
  const [quoteNumber, setQuoteNumber] = useState(
    existingQuote?.quoteNumber ?? ""
  );
  const [validUntil, setValidUntil] = useState(
    existingQuote?.validUntil ?? defaultValidUntil()
  );
  const [items, setItems] = useState<QuoteLineData[]>(
    existingQuote?.items?.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      vatRate: (i.vatRate ?? "25") as VatRateType,
      billingFrequency: (i.billingFrequency ?? "one-time") as BillingFrequency,
    })) ?? [emptyLine()]
  );
  const [notes, setNotes] = useState(existingQuote?.notes ?? "");
  const [language, setLanguage] = useState<"sv" | "en">(
    existingQuote?.language ?? "sv"
  );
  const [estimatedHours, setEstimatedHours] = useState(
    existingQuote?.estimatedHours ?? 0
  );
  const [costs, setCosts] = useState<CostEntry[]>(
    existingQuote?.costs?.map((c) => ({ label: c.label, amount: c.amount })) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const currency = "SEK";

  const totals = useMemo(() => calcQuoteTotals(items), [items]);

  const selectedCustomer: Customer | undefined = customers.find(
    (c) => c.id === customerId
  );

  // Auto-generate quote number for new quotes
  useEffect(() => {
    if (!existingQuote && !quoteNumber) {
      generateQuoteNumber().then(setQuoteNumber);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleLineChange(
    index: number,
    field: keyof QuoteLineData,
    value: string | number
  ) {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  function handleSelectProduct(
    index: number,
    data: Pick<QuoteLineData, "description" | "unitPrice" | "productId" | "sku">
  ) {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...data };
      return updated;
    });
  }

  function addLine() {
    setItems((prev) => [...prev, emptyLine()]);
  }

  function addTextLine() {
    setItems((prev) => [...prev, emptyTextLine()]);
  }

  function handleDragStart(index: number) {
    setDragIndex(index);
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) return;
    setItems((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(dragIndex, 1);
      updated.splice(targetIndex, 0, moved);
      return updated;
    });
    setDragIndex(null);
  }

  function removeLine(index: number) {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function buildFormData(
    status: "draft" | "created"
  ): QuoteFormData {
    return {
      customerId,
      quoteNumber,
      items: items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        vatRate: i.vatRate,
        billingFrequency: i.billingFrequency,
      })),
      subtotal: totals.subtotal,
      vatAmount: totals.vatAmount,
      totalAmount: totals.total,
      currency,
      validUntil,
      status,
      language,
      ...(notes && { notes }),
      ...(estimatedHours && { estimatedHours }),
      ...(costs.length > 0 && { costs }),
    };
  }

  async function handleSaveDraft() {
    if (!customerId) return;
    setSaving(true);
    try {
      const data = buildFormData("draft");
      if (existingQuote) {
        await updateQuote(existingQuote.id, data);
      } else {
        const result = await addQuote(data);
        setQuoteNumber(result.quoteNumber);
      }
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveQuote() {
    if (!customerId || !existingQuote) return;
    setSaving(true);
    try {
      const keepStatus = existingQuote.status === "draft" ? "created" : existingQuote.status;
      await updateQuote(existingQuote.id, { ...buildFormData("created"), status: keepStatus });
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  async function handleCreatePdf() {
    if (!customerId || !profile) return;
    setSaving(true);
    try {
      const data = buildFormData("created");
      let qNum = quoteNumber;
      if (existingQuote) {
        await updateQuote(existingQuote.id, data);
      } else {
        const result = await addQuote(data);
        qNum = result.quoteNumber;
        setQuoteNumber(qNum);
      }

      const logoDataUrl = profile.logoUrl
        ? await fetchLogoDataUrl(profile.logoUrl)
        : undefined;

      generateQuotePdf({
        profile,
        customer: selectedCustomer!,
        quoteNumber: qNum,
        validUntil,
        items,
        totals,
        notes,
        language,
        currency,
        logoDataUrl,
      });

      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  async function handleAddCustomerInline(data: Parameters<typeof addCustomer>[0]) {
    const newId = await addCustomer(data);
    setCustomerId(newId);
    setShowAddCustomer(false);
  }

  return (
    <div className="space-y-6">
      <AddCustomerDialog
        open={showAddCustomer}
        onOpenChange={setShowAddCustomer}
        onSubmit={handleAddCustomerInline}
      />

      {/* Customer & Quote Details */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium">{t("form.customer")}</label>
          <div className="flex gap-2">
            <select
              className={INPUT_CLASS}
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              required
            >
              <option value="">{t("form.selectCustomer")}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowAddCustomer(true)}
              className="shrink-0 flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title={t("form.addCustomer")}
            >
              <UserPlus className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="hidden">
          <input
            value={quoteNumber}
            onChange={(e) => setQuoteNumber(e.target.value)}
            readOnly
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">{t("form.validUntil")}</label>
          <input
            className={INPUT_CLASS}
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            required
          />
        </div>
      </div>

      {/* Article Lines */}
      <div className="rounded-lg border border-border bg-background overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="py-2 pl-2 w-6" />
              <th className="py-2 pr-2 text-left font-medium text-muted-foreground">
                {t("form.columns.description")}
              </th>
              <th className="py-2 px-2 text-right font-medium text-muted-foreground w-20">
                {t("form.columns.qty")}
              </th>
              <th className="py-2 px-2 text-right font-medium text-muted-foreground w-28">
                {t("form.columns.unitPrice")}
              </th>
              <th className="py-2 px-2 text-left font-medium text-muted-foreground w-24">
                {t("form.columns.vat")}
              </th>
              <th className="py-2 px-2 text-left font-medium text-muted-foreground w-28">
                {t("form.columns.billing")}
              </th>
              <th className="py-2 px-2 text-right font-medium text-muted-foreground">
                {t("form.columns.total")}
              </th>
              <th className="py-2 px-2 text-right font-medium text-muted-foreground">
                {t("form.columns.vatAmt")}
              </th>
              <th className="py-2 pl-2 pr-4 w-10" />
            </tr>
          </thead>
          <tbody className="px-4">
            {items.map((item, i) => (
              <QuoteLineItem
                key={i}
                item={item}
                index={i}
                onChange={handleLineChange}
                onSelectProduct={handleSelectProduct}
                onRemove={removeLine}
                currency={currency}
                suggestions={suggestions}
                isDragging={dragIndex === i}
                onDragStart={() => handleDragStart(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(i)}
                onDragEnd={() => setDragIndex(null)}
              />
            ))}
          </tbody>
        </table>
        <div className="p-2 border-t border-border flex gap-2">
          <button
            type="button"
            onClick={addLine}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t("form.addLine")}
          </button>
          <button
            type="button"
            onClick={addTextLine}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <Type className="h-4 w-4" />
            {t("form.addText")}
          </button>
        </div>
      </div>

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-full max-w-xs space-y-1 rounded-lg border border-border bg-background p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("form.subtotal")}</span>
            <span className="tabular-nums">
              {totals.subtotal.toLocaleString(currentLocale(), {
                minimumFractionDigits: 2,
              })}{" "}
              {currency}
            </span>
          </div>
          {totals.vatBreakdown.map((entry) => (
            <div key={entry.rate} className="flex justify-between text-muted-foreground">
              <span>{t("form.vatRate", { rate: entry.rate })}</span>
              <span className="tabular-nums">
                {entry.amount.toLocaleString(currentLocale(), {
                  minimumFractionDigits: 2,
                })}{" "}
                {currency}
              </span>
            </div>
          ))}
          <div className="flex justify-between border-t border-border pt-1 font-semibold">
            <span>{t("form.total")}</span>
            <span className="tabular-nums">
              {totals.total.toLocaleString(currentLocale(), {
                minimumFractionDigits: 2,
              })}{" "}
              {currency}
            </span>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="mb-1 block text-sm font-medium">{t("form.notes")}</label>
        <textarea
          className={INPUT_CLASS + " min-h-[60px] resize-y"}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("form.notesPlaceholder")}
        />
      </div>

      {/* Profitability */}
      <ProfitabilityCard
        subtotal={totals.subtotal}
        mrr={totals.mrr}
        estimatedHours={estimatedHours}
        costs={costs}
        currency={currency}
        onEstimatedHoursChange={setEstimatedHours}
        onCostsChange={setCosts}
      />

      {/* Language toggle + Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">{t("form.pdfLanguage")}</label>
          <button
            type="button"
            onClick={() => setLanguage("sv")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              language === "sv"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {t("form.languageSv")}
          </button>
          <button
            type="button"
            onClick={() => setLanguage("en")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              language === "en"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {t("form.languageEn")}
          </button>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={!customerId || saving}
            className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            {saving ? t("form.saving") : t("form.saveDraft")}
          </button>
          {existingQuote && (
            <button
              type="button"
              onClick={handleSaveQuote}
              disabled={!customerId || saving}
              className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              {saving ? t("form.saving") : t("form.saveQuote")}
            </button>
          )}
          <button
            type="button"
            onClick={handleCreatePdf}
            disabled={!customerId || !profile || saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving
              ? t("form.saving")
              : existingQuote
              ? t("form.updatePdf")
              : t("form.createPdf")}
          </button>
        </div>
      </div>

      {!profile && (
        <p className="text-sm text-amber-600">
          {t("form.noProfile")}
        </p>
      )}
    </div>
  );
}
