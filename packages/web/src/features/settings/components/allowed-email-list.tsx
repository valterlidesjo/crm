import { useState } from "react";
import { useTranslation } from "react-i18next";
import { type AllowedEmail, type UserRole } from "@crm/shared";
import { Trash2 } from "lucide-react";

interface AllowedEmailListProps {
  emails: AllowedEmail[];
  onRemove: (id: string) => Promise<void>;
  onUpdateRole: (uid: string, role: UserRole) => Promise<void>;
}

export function AllowedEmailList({ emails, onRemove, onUpdateRole }: AllowedEmailListProps) {
  const { t } = useTranslation("settings");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm(t("users.confirmRemove"))) return;

    setDeletingId(id);
    try {
      await onRemove(id);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRoleChange(uid: string, role: UserRole) {
    setUpdatingId(uid);
    try {
      await onUpdateRole(uid, role);
    } finally {
      setUpdatingId(null);
    }
  }

  if (emails.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed border-border rounded-lg">
        <p className="text-sm text-muted-foreground">{t("users.empty")}</p>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="text-left px-4 py-3 font-medium">{t("users.table.email")}</th>
            <th className="text-left px-4 py-3 font-medium">{t("users.table.role")}</th>
            <th className="text-left px-4 py-3 font-medium">{t("users.table.addedBy")}</th>
            <th className="text-right px-4 py-3 font-medium">{t("users.table.actions")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {emails.map((email) => (
            <tr key={email.id} className="hover:bg-muted/50">
              <td className="px-4 py-3">{email.email}</td>
              <td className="px-4 py-3">
                <select
                  value={email.role}
                  onChange={(e) => handleRoleChange(email.id, e.target.value as UserRole)}
                  disabled={updatingId === email.id}
                  className="rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="user">{t("role.user")}</option>
                  <option value="admin">{t("role.admin")}</option>
                </select>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {email.addedBy || "—"}
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => handleDelete(email.id)}
                  disabled={deletingId === email.id}
                  className="inline-flex items-center gap-1 text-destructive hover:text-destructive/80 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  {deletingId === email.id ? t("users.removing") : t("users.remove")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
