import { useState } from "react";
import { useTranslation } from "react-i18next";
import { type UserRole } from "@crm/shared";
import { X } from "lucide-react";

interface AddEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (email: string, role: UserRole) => Promise<void>;
}

export function AddEmailDialog({ open, onOpenChange, onSubmit }: AddEmailDialogProps) {
  const { t } = useTranslation(["settings", "common"]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      await onSubmit(email, role);
      setEmail("");
      setRole("user");
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t("addEmail.title")}</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">
              {t("addEmail.emailLabel")} <span className="text-destructive">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder={t("addEmail.emailPlaceholder")}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              {t("addEmail.roleLabel")} <span className="text-destructive">*</span>
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="user">{t("role.user")}</option>
              <option value="admin">{t("role.admin")}</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("addEmail.roleHint")}
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              {t("common:actions.cancel")}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {submitting ? t("addEmail.submitting") : t("addEmail.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
