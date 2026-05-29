import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Trash2, Plus, UserCircle } from "lucide-react";
import { PARTNER_ROLE_LABELS, type PartnerRole } from "@crm/shared";
import { usePartnerMembers } from "../hooks/use-partner-members";

interface Props {
  partnerId: string;
}

export function PartnerMembersTab({ partnerId }: Props) {
  const { t } = useTranslation(["partners", "common"]);
  const { members, loading, addMember, removeMember, updateMemberRole } = usePartnerMembers(partnerId);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<PartnerRole>("user");
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      await addMember(email.trim().toLowerCase(), role);
      setEmail("");
      setRole("user");
      setShowForm(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (memberEmail: string) => {
    await removeMember(memberEmail);
    setConfirmDelete(null);
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground px-1">{t("members.loading")}</p>;
  }

  return (
    <div className="space-y-3">
      {members.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground px-1">{t("members.empty")}</p>
      )}

      {members.length > 0 && (
        <div className="divide-y divide-border rounded-md border">
          {members.map((member) => (
            <div key={member.id} className="flex items-center gap-3 px-3 py-2.5">
              <UserCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate text-sm">{member.email}</span>
              <select
                value={member.role}
                onChange={(e) => updateMemberRole(member.email, e.target.value as PartnerRole)}
                className="rounded-md border border-input bg-background px-2 py-1 text-xs"
              >
                {(Object.keys(PARTNER_ROLE_LABELS) as PartnerRole[]).map((r) => (
                  <option key={r} value={r}>{t(`role.${r}`)}</option>
                ))}
              </select>
              {confirmDelete === member.email ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleRemove(member.email)}
                    className="rounded px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                  >
                    {t("common:actions.confirm")}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                  >
                    {t("common:actions.cancel")}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(member.email)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm ? (
        <form onSubmit={handleAdd} className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground">{t("members.emailLabel")}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("members.emailPlaceholder")}
              required
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{t("members.roleLabel")}</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as PartnerRole)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            >
              {(Object.keys(PARTNER_ROLE_LABELS) as PartnerRole[]).map((r) => (
                <option key={r} value={r}>{t(`role.${r}`)}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? t("members.adding") : t("common:actions.add")}
          </button>
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
          >
            {t("common:actions.cancel")}
          </button>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("members.addMember")}
        </button>
      )}
    </div>
  );
}
