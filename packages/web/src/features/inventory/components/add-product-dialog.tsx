import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";
import { usePartner } from "@/lib/partner";
import { useProducts } from "../hooks/use-products";
import { googleCategoryForProductType } from "@crm/shared";
import { X, Upload, ImageIcon } from "lucide-react";

interface AddProductDialogProps {
  onClose: () => void;
}

export function AddProductDialog({ onClose }: AddProductDialogProps) {
  const { t } = useTranslation("inventory");
  const { partnerId } = usePartner();
  const { addProduct } = useProducts();

  const [title, setTitle] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [productType, setProductType] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [compareAtPrice, setCompareAtPrice] = useState("");
  const [stock, setStock] = useState("0");
  const [description, setDescription] = useState("");
  const [vendor, setVendor] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
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
      let imageUrl: string | undefined;

      if (imageFile) {
        const productId = crypto.randomUUID();
        const storageRef = ref(
          storage,
          `partners/${partnerId}/products/${productId}/cover`
        );
        await uploadBytes(storageRef, imageFile);
        imageUrl = await getDownloadURL(storageRef);
      }

      const trimmedProductType = productType.trim() || undefined;

      const parsedPrice = price ? parseFloat(price) : undefined;
      const parsedCompareAt = compareAtPrice
        ? parseFloat(compareAtPrice)
        : undefined;

      await addProduct({
        title: title.trim(),
        groupTitle: groupTitle.trim() || undefined,
        productType: trimmedProductType,
        googleProductCategory: googleCategoryForProductType(trimmedProductType),
        sku: sku.trim() || undefined,
        price: parsedPrice,
        compareAtPrice:
          parsedCompareAt && parsedPrice && parsedCompareAt > parsedPrice
            ? parsedCompareAt
            : undefined,
        stock: parseInt(stock, 10) || 0,
        description: description.trim() || undefined,
        vendor: vendor.trim() || undefined,
        imageUrl,
        status: "active",
      });

      onClose();
    } catch (err) {
      setError(t("addProduct.error"));
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
          <h2 className="text-lg font-semibold">{t("addProduct.title")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic info */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium">
                {t("addProduct.fieldTitle")} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder={t("addProduct.titlePlaceholder")}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">{t("addProduct.fieldSku")}</label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder={t("addProduct.skuPlaceholder")}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                {t("addProduct.fieldGroup")}
              </label>
              <input
                type="text"
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                placeholder={t("addProduct.groupPlaceholder")}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium">
                {t("addProduct.fieldProductType")}
              </label>
              <input
                type="text"
                value={productType}
                onChange={(e) => setProductType(e.target.value)}
                placeholder={t("addProduct.productTypePlaceholder")}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t("addProduct.productTypeHelp")}
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                {t("addProduct.fieldPrice")}
              </label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0"
                min="0"
                step="1"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                {t("addProduct.fieldCompareAtPrice")}
              </label>
              <input
                type="number"
                value={compareAtPrice}
                onChange={(e) => setCompareAtPrice(e.target.value)}
                placeholder={t("addProduct.compareAtPlaceholder")}
                min="0"
                step="1"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t("addProduct.compareAtHelp")}
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">{t("addProduct.fieldStock")}</label>
              <input
                type="number"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                placeholder="0"
                min="0"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                {t("addProduct.fieldVendor")}
              </label>
              <input
                type="text"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder={t("addProduct.vendorPlaceholder")}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium">
                {t("addProduct.fieldDescription")}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder={t("addProduct.descriptionPlaceholder")}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>
          </div>

          {/* Image upload */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              {t("addProduct.fieldImage")}
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border py-8 hover:border-primary/50 hover:bg-muted/30 transition-colors"
            >
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="max-h-40 rounded-md object-contain"
                />
              ) : (
                <>
                  <ImageIcon className="mb-2 h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    {t("addProduct.clickToUpload")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    {t("addProduct.imageFormats")}
                  </p>
                </>
              )}
            </div>
            {imagePreview && (
              <button
                type="button"
                onClick={() => {
                  setImageFile(null);
                  setImagePreview(null);
                }}
                className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Upload className="h-3 w-3" /> {t("addProduct.changeImage")}
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
              {t("addProduct.cancel")}
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? t("addProduct.saving") : t("addProduct.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
