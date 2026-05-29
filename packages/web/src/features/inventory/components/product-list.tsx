import { useTranslation } from "react-i18next";
import type { Product } from "@crm/shared";
import { cn } from "@/lib/utils";
import { Package, ShoppingCart } from "lucide-react";

interface ProductListProps {
  products: Product[];
  onAdjustStock: (product: Product) => void;
  onRecordSale: (product: Product) => void;
}

function StockBadge({ stock }: { stock: number }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        stock === 0
          ? "bg-red-100 text-red-700"
          : stock < 5
            ? "bg-orange-100 text-orange-700"
            : stock < 20
              ? "bg-yellow-100 text-yellow-700"
              : "bg-green-100 text-green-700"
      )}
    >
      {stock}
    </span>
  );
}

export function ProductList({
  products,
  onAdjustStock,
  onRecordSale,
}: ProductListProps) {
  const { t } = useTranslation("inventory");
  const active = products.filter((p) => p.status === "active");
  const archived = products.filter((p) => p.status === "archived");

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Package className="mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          {t("list.emptyState")}
        </p>
      </div>
    );
  }

  function renderGroup(items: Product[], label?: string) {
    if (items.length === 0) return null;

    // Sort by group then title so articles in the same group sit together.
    const sorted = [...items].sort((a, b) => {
      const ga = a.groupTitle ?? a.title;
      const gb = b.groupTitle ?? b.title;
      if (ga !== gb) return ga.localeCompare(gb);
      return a.title.localeCompare(b.title);
    });

    let lastGroup: string | null = null;

    return (
      <>
        {label && (
          <p className="mb-2 mt-6 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
        )}
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="py-2.5 px-4 text-left font-medium text-muted-foreground w-12" />
                <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">
                  {t("list.columnArticle")}
                </th>
                <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">
                  {t("list.columnSku")}
                </th>
                <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">
                  {t("list.columnStock")}
                </th>
                <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">
                  {t("list.columnPrice")}
                </th>
                <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">
                  {t("list.columnShopify")}
                </th>
                <th className="py-2.5 px-4 text-right font-medium text-muted-foreground">
                  {t("list.columnActions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((product) => {
                const group = product.groupTitle ?? null;
                const showGroupHeader =
                  group !== null && group !== product.title && group !== lastGroup;
                if (group !== null) lastGroup = group;

                return (
                  <ProductRow
                    key={product.id}
                    product={product}
                    groupHeader={showGroupHeader ? group : null}
                    onAdjustStock={onAdjustStock}
                    onRecordSale={onRecordSale}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  if (archived.length === 0) {
    return <>{renderGroup(active)}</>;
  }

  return (
    <>
      {renderGroup(active, t("list.active"))}
      {renderGroup(archived, t("list.archived"))}
    </>
  );
}

function ProductRow({
  product,
  groupHeader,
  onAdjustStock,
  onRecordSale,
}: {
  product: Product;
  groupHeader: string | null;
  onAdjustStock: (product: Product) => void;
  onRecordSale: (product: Product) => void;
}) {
  const { t } = useTranslation("inventory");
  return (
    <>
      {groupHeader && (
        <tr className="bg-muted/10">
          <td colSpan={7} className="px-4 pt-3 pb-1">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {groupHeader}
            </span>
          </td>
        </tr>
      )}
      <tr className="border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors">
        {/* Thumbnail */}
        <td className="py-2.5 px-4">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.title}
              className="h-9 w-9 rounded-md object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
              <Package className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </td>

        {/* Title + vendor */}
        <td className="py-2.5 px-4">
          <p className="font-medium">{product.title}</p>
          {product.vendor && (
            <p className="text-xs text-muted-foreground">{product.vendor}</p>
          )}
        </td>

        {/* SKU */}
        <td className="py-2.5 px-4">
          {product.sku ? (
            <span className="font-mono text-xs">{product.sku}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>

        {/* Stock */}
        <td className="py-2.5 px-4">
          <StockBadge stock={product.stock} />
        </td>

        {/* Price */}
        <td className="py-2.5 px-4">
          {product.price != null ? (
            <span className="tabular-nums">{t("list.priceWithUnit", { price: product.price })}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>

        {/* Shopify sync indicator */}
        <td className="py-2.5 px-4">
          {product.shopifyProductId ? (
            <span className="inline-flex items-center gap-1 text-xs text-green-600">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              {t("list.linked")}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">{t("list.notLinked")}</span>
          )}
        </td>

        {/* Actions */}
        <td className="py-2.5 px-4 text-right">
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => onRecordSale(product)}
              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
            >
              <ShoppingCart className="h-3 w-3" />
              {t("list.sell")}
            </button>
            <button
              type="button"
              onClick={() => onAdjustStock(product)}
              className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
            >
              {t("list.adjustStock")}
            </button>
          </div>
        </td>
      </tr>
    </>
  );
}
