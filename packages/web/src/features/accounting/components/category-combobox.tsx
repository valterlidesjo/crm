import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AccountCategory } from "@crm/shared";
import { cn } from "@/lib/utils";

interface CategoryComboboxProps {
  categories: AccountCategory[];
  value: string;
  onChange: (categoryId: string) => void;
  /** Called when the user chooses to create a category from their query. */
  onCreateNew?: (query: string) => void;
  placeholder?: string;
  className?: string;
}

function label(cat: AccountCategory): string {
  return `${cat.name} (${cat.defaultAccountNumber})`;
}

function matches(cat: AccountCategory, q: string): boolean {
  const needle = q.toLowerCase();
  return (
    cat.name.toLowerCase().includes(needle) ||
    cat.defaultAccountNumber.includes(needle) ||
    cat.defaultAccountName.toLowerCase().includes(needle)
  );
}

/**
 * A searchable category picker. Type a name or an account number (e.g. "1957")
 * to filter; pick with mouse or keyboard. Offers an inline "create new" action
 * so a missing category never blocks data entry.
 */
export function CategoryCombobox({
  categories,
  value,
  onChange,
  onCreateNew,
  placeholder,
  className,
}: CategoryComboboxProps) {
  const { t } = useTranslation("accounting");
  const resolvedPlaceholder = placeholder ?? t("categoryCombobox.placeholder");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = categories.find((c) => c.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim();
    const list = q ? categories.filter((c) => matches(c, q)) : categories;
    return list.slice(0, 50);
  }, [categories, query]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function choose(cat: AccountCategory) {
    onChange(cat.id);
    setQuery("");
    setOpen(false);
  }

  const showCreate = Boolean(onCreateNew) && query.trim().length > 0;

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (!open) return;
      e.preventDefault();
      if (filtered[highlight]) {
        choose(filtered[highlight]);
      } else if (showCreate) {
        onCreateNew?.(query.trim());
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          value={open ? query : selected ? label(selected) : ""}
          placeholder={resolvedPlaceholder}
          onFocus={() => {
            setOpen(true);
            setQuery("");
            setHighlight(0);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onKeyDown={handleKeyDown}
          className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-background py-1 shadow-lg">
          {filtered.length === 0 && !showCreate && (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              {t("categoryCombobox.noMatches")}
            </p>
          )}
          {filtered.map((cat, i) => (
            <button
              key={cat.id}
              type="button"
              onMouseEnter={() => setHighlight(i)}
              onClick={() => choose(cat)}
              className={cn(
                "flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm",
                i === highlight ? "bg-muted" : "hover:bg-muted/60"
              )}
            >
              <span className="truncate">
                {cat.name}
                <span
                  className={cn(
                    "ml-2 text-xs",
                    cat.transactionType === "cost"
                      ? "text-red-500"
                      : "text-green-600"
                  )}
                >
                  {cat.transactionType === "cost"
                    ? t("categoryCombobox.cost")
                    : t("categoryCombobox.income")}
                </span>
              </span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {cat.defaultAccountNumber}
              </span>
            </button>
          ))}

          {showCreate && (
            <button
              type="button"
              onClick={() => {
                onCreateNew?.(query.trim());
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm text-primary hover:bg-muted/60"
            >
              <Plus className="h-4 w-4" />
              {t("categoryCombobox.createCategory", { query: query.trim() })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
