import { useState, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { Trash2, GripVertical } from "lucide-react";
import { currentLocale } from "@/i18n";
import { calcLineTotal, calcLineVat } from "../utils/calculations";
import type { InvoiceLineData } from "../utils/calculations";
import type { VatRateType } from "@crm/shared";
import type { ProductSuggestion } from "../hooks/use-product-suggestions";

const INPUT_CLASS =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors";

const VAT_OPTIONS: { value: VatRateType; label: string }[] = [
  { value: "25", label: "25%" },
  { value: "12", label: "12%" },
  { value: "6", label: "6%" },
  { value: "0", label: "0%" },
];

interface InvoiceLineItemProps {
  item: InvoiceLineData;
  index: number;
  onChange: (index: number, field: keyof InvoiceLineData, value: string | number) => void;
  onSelectProduct: (index: number, data: Pick<InvoiceLineData, "description" | "unitPrice" | "productId" | "sku">) => void;
  onRemove: (index: number) => void;
  currency: string;
  suggestions: ProductSuggestion[];
  isDragging: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

export function InvoiceLineItem({
  item,
  index,
  onChange,
  onSelectProduct,
  onRemove,
  currency,
  suggestions,
  isDragging,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: InvoiceLineItemProps) {
  const { t } = useTranslation("invoices");
  const isText = item.type === "text";
  const lineTotal = isText ? 0 : calcLineTotal(item.quantity, item.unitPrice);
  const lineVat = isText ? 0 : calcLineVat(item.quantity, item.unitPrice, item.vatRate);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (isText) return [];
    const q = item.description.toLowerCase();
    return suggestions
      .filter((s) => {
        if (!q) return true;
        return (
          s.description.toLowerCase().includes(q) ||
          (s.sku?.toLowerCase().includes(q) ?? false)
        );
      })
      .slice(0, 8);
  }, [suggestions, item.description, isText]);

  useEffect(() => {
    if (!open) return;
    let rafId: number;
    function updatePos() {
      const rect = inputRef.current?.getBoundingClientRect();
      const el = dropdownRef.current;
      if (!rect || !el) return;
      el.style.top = `${rect.bottom + 4}px`;
      el.style.left = `${rect.left}px`;
      el.style.width = `${Math.max(rect.width, 300)}px`;
    }
    function onScrollOrResize() {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updatePos);
    }
    updatePos();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  function handleSelect(s: ProductSuggestion) {
    onSelectProduct(index, {
      description: s.description,
      unitPrice: s.unitPrice,
      productId: s.productId,
      sku: s.sku,
    });
    setOpen(false);
  }

  const dropdown =
    open && filtered.length > 0
      ? createPortal(
          <div
            ref={dropdownRef}
            style={{ position: "fixed", zIndex: 9999 }}
            className="rounded-md border border-border bg-background shadow-lg"
          >
            {filtered.map((s) => (
              <button
                key={s.sku ?? s.description}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(s)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted transition-colors first:rounded-t-md last:rounded-b-md"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="truncate">{s.description}</span>
                  {s.sku && (
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
                      {s.sku}
                    </span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {s.unitPrice.toLocaleString(currentLocale(), { minimumFractionDigits: 2 })}
                </span>
              </button>
            ))}
          </div>,
          document.body
        )
      : null;

  return (
    <tr
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`border-b border-border last:border-b-0 transition-opacity ${isDragging ? "opacity-40" : ""}`}
    >
      <td className="py-2 pl-2 w-6">
        <span className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground flex items-center">
          <GripVertical className="h-4 w-4" />
        </span>
      </td>
      {isText ? (
        <td className="py-2 pr-2" colSpan={6}>
          <input
            className={INPUT_CLASS + " italic text-muted-foreground"}
            value={item.description}
            onChange={(e) => onChange(index, "description", e.target.value)}
            placeholder={t("lineItem.textPlaceholder")}
          />
        </td>
      ) : (
        <>
          <td className="py-2 pr-2">
            <input
              ref={inputRef}
              className={INPUT_CLASS}
              value={item.description}
              onChange={(e) => onChange(index, "description", e.target.value)}
              placeholder={t("lineItem.descriptionPlaceholder")}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 120)}
            />
            {dropdown}
          </td>
          <td className="py-2 px-2">
            <input
              className={INPUT_CLASS + " w-20 text-right"}
              type="number"
              min="0"
              step="1"
              value={item.quantity || ""}
              onChange={(e) =>
                onChange(index, "quantity", parseFloat(e.target.value) || 0)
              }
            />
          </td>
          <td className="py-2 px-2">
            <input
              className={INPUT_CLASS + " w-28 text-right"}
              type="number"
              min="0"
              step="0.01"
              value={item.unitPrice || ""}
              onChange={(e) =>
                onChange(index, "unitPrice", parseFloat(e.target.value) || 0)
              }
            />
          </td>
          <td className="py-2 px-2">
            <select
              className={INPUT_CLASS + " w-24"}
              value={item.vatRate}
              onChange={(e) => onChange(index, "vatRate", e.target.value)}
            >
              {VAT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </td>
          <td className="py-2 px-2 text-right text-sm tabular-nums whitespace-nowrap">
            {lineTotal.toLocaleString(currentLocale(), { minimumFractionDigits: 2 })} {currency}
          </td>
          <td className="py-2 px-2 text-right text-sm tabular-nums text-muted-foreground whitespace-nowrap">
            {lineVat.toLocaleString(currentLocale(), { minimumFractionDigits: 2 })}
          </td>
        </>
      )}
      <td className="py-2 pl-2 pr-2">
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}
