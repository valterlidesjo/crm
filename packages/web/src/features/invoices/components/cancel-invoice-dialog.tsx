import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface CancelInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceNumber: string;
  onConfirm: (reason: string) => Promise<void>;
}

export function CancelInvoiceDialog({
  open,
  onOpenChange,
  invoiceNumber,
  onConfirm,
}: CancelInvoiceDialogProps) {
  const { t } = useTranslation("invoices");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      await onConfirm(reason.trim());
      setReason("");
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(open: boolean) {
    if (!submitting) {
      setReason("");
      onOpenChange(open);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("cancelDialog.title", { number: invoiceNumber })}</DialogTitle>
          <DialogDescription>
            {t("cancelDialog.description")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="cancel-reason"
              className="text-sm font-medium text-foreground"
            >
              {t("cancelDialog.reasonLabel")} <span className="text-red-500">*</span>
            </label>
            <textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("cancelDialog.reasonPlaceholder")}
              rows={4}
              disabled={submitting}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              {t("cancelDialog.cancel")}
            </button>
            <button
              type="submit"
              disabled={!reason.trim() || submitting}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {submitting ? t("cancelDialog.cancelling") : t("cancelDialog.confirm")}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
