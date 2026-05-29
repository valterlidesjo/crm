import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { usePartner } from "@/lib/partner";
import { useProducts } from "../hooks/use-products";
import type { Product } from "@crm/shared";
import { X, ImageIcon, Upload } from "lucide-react";

interface EditProductDialogProps {
  product: Product;
  onClose: () => void;
}

export function EditProductDialog({ product, onClose }: EditProductDialogProps) {
  const { t } = useTranslation("inventory");
  const { partnerId } = usePartner();
  const { updateProduct } = useProducts();

  const [title, setTitle] = useState(product.title);
  const [groupTitle, setGroupTitle] = useState(product.groupTitle ?? "");
  const [sku, setSku] = useState(product.sku ?? "");
  const [price, setPrice] = useState(product.price?.toString() ?? "");
  const [stock, setStock] = useState(product.stock.toString());
  const [description, setDescription] = useState(product.description ?? "");
  const [vendor, setVendor] = useState(product.vendor ?? "");
  const [status, setStatus] = useState<"active" | "archived">(product.status);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(
    product.imageUrl ?? null
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);

    try {
      let imageUrl: string | undefined = product.imageUrl;

      if (imageFile) {
        const storageRef = ref(
          storage,
          `partners/${partnerId}/products/${product.id}/cover`
        );
        await uploadBytes(storageRef, imageFile);
        imageUrl = await getDownloadURL(storageRef);
      }

      await updateProduct(product.id, {
        title: title.trim(),
        groupTitle: groupTitle.trim() || undefined,
        sku: sku.trim() || undefined,
        price: price ? parseFloat(price) : undefined,
        stock: parseInt(stock, 10) || 0,
        description: description.trim() || undefined,
        vendor: vendor.trim() || undefined,
        imageUrl,
        status,
      });

      onClose();
    } catch (err) {
      setError(t("editProduct.error"));
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">{t("editProduct.title")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Shopify badge */}
          {product.shopifyProductId && (
            <div className="flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              {t("editProduct.shopifyBadge")}
            </div>
          )}

          {/* Basic info */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium">
                {t("editProduct.fieldTitle")} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">{t("editProduct.fieldSku")}</label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                {t("editProduct.fieldGroup")}
              </label>
              <input
                type="text"
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                {t("editProduct.fieldPrice")}
              </label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                min="0"
                step="1"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">{t("editProduct.fieldStock")}</label>
              <input
                type="number"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                min="0"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                {t("editProduct.fieldVendor")}
              </label>
              <input
                type="text"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">{t("editProduct.fieldStatus")}</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "active" | "archived")}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="active">{t("editProduct.statusActive")}</option>
                <option value="archived">{t("editProduct.statusArchived")}</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium">
                {t("editProduct.fieldDescription")}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>
          </div>

          {/* Image */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              {t("editProduct.fieldImage")}
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border py-6 hover:border-primary/50 hover:bg-muted/30 transition-colors"
            >
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="max-h-32 rounded-md object-contain"
                />
              ) : (
                <>
                  <ImageIcon className="mb-2 h-7 w-7 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    {t("editProduct.clickToChange")}
                  </p>
                </>
              )}
            </div>
            {imagePreview && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Upload className="h-3 w-3" /> {t("editProduct.changeImage")}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageChange}
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              {t("editProduct.cancel")}
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? t("editProduct.saving") : t("editProduct.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
