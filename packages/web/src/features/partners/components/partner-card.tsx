import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, Eye, Trash2 } from "lucide-react";
import { PartnerFeaturesTab } from "./partner-features-tab";
import { PartnerMembersTab } from "./partner-members-tab";
import type { PartnerDoc } from "../hooks/use-partners";
import type { FeatureKey } from "@crm/shared";
import { usePartner } from "@/lib/partner";

type Tab = "members" | "features";

interface Props {
  partner: PartnerDoc;
  onUpdateName: (id: string, name: string) => Promise<void>;
  onUpdateFeatures: (id: string, features: Record<FeatureKey, boolean>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function PartnerCard({ partner, onUpdateName, onUpdateFeatures, onDelete }: Props) {
  const { t } = useTranslation(["partners", "common"]);
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("members");
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(partner.name);
  const [savingName, setSavingName] = useState(false);
  const [savingFeatures, setSavingFeatures] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { startEmulation } = usePartner();
  const navigate = useNavigate();

  const handleEmulate = () => {
    startEmulation(partner.id, partner.name);
    navigate({ to: "/" });
  };

  const handleNameSave = async () => {
    if (!nameValue.trim() || nameValue === partner.name) {
      setEditingName(false);
      setNameValue(partner.name);
      return;
    }
    setSavingName(true);
    try {
      await onUpdateName(partner.id, nameValue.trim());
      setEditingName(false);
    } finally {
      setSavingName(false);
    }
  };

  const handleFeaturesChange = async (features: Record<FeatureKey, boolean>) => {
    setSavingFeatures(true);
    try {
      await onUpdateFeatures(partner.id, features);
    } finally {
      setSavingFeatures(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-muted-foreground hover:text-foreground"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {editingName ? (
          <form
            onSubmit={(e) => { e.preventDefault(); handleNameSave(); }}
            className="flex flex-1 items-center gap-2"
          >
            <input
              type="text"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              autoFocus
              className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={savingName}
              className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {savingName ? t("card.saving") : t("common:actions.save")}
            </button>
            <button
              type="button"
              onClick={() => { setEditingName(false); setNameValue(partner.name); }}
              className="rounded-md border border-input px-3 py-1 text-xs hover:bg-muted"
            >
              {t("common:actions.cancel")}
            </button>
          </form>
        ) : (
          <button
            onClick={() => setEditingName(true)}
            className="flex-1 text-left text-sm font-medium hover:underline"
          >
            {partner.name}
          </button>
        )}

        <span className="font-mono text-xs text-muted-foreground">{partner.id}</span>

        <button
          onClick={handleEmulate}
          title={t("card.emulateTitle")}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>

        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onDelete(partner.id)}
              className="rounded px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
            >
              {t("common:actions.delete")}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              {t("common:actions.cancel")}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          {/* Tabs */}
          <div className="mb-3 flex gap-1 border-b border-border">
            {(["members", "features"] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={[
                  "px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                  activeTab === tab
                    ? "border-b-2 border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {t(`tabs.${tab}`)}
              </button>
            ))}
          </div>

          {activeTab === "members" && (
            <PartnerMembersTab partnerId={partner.id} />
          )}

          {activeTab === "features" && (
            <PartnerFeaturesTab
              features={partner.features}
              onChange={handleFeaturesChange}
              saving={savingFeatures}
            />
          )}
        </div>
      )}
    </div>
  );
}
