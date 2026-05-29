import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { useState } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { requireSuperAdmin } from "@/lib/route-guards";
import { usePartners } from "@/features/partners/hooks/use-partners";
import { usePartner } from "@/lib/partner";
import { PartnerCard } from "@/features/partners/components/partner-card";
import { CreatePartnerDialog } from "@/features/partners/components/create-partner-dialog";
import type { PartnerRole } from "@crm/shared";

export const Route = createFileRoute("/partners/")({
  beforeLoad: ({ context }) => {
    requireSuperAdmin(context.auth);
  },
  component: PartnersPage,
});

async function addMemberToNewPartner(
  partnerId: string,
  member: { email: string; role: PartnerRole }
) {
  const now = new Date().toISOString();
  await setDoc(doc(db, "partners", partnerId, "members", member.email), {
    email: member.email,
    role: member.role,
    createdAt: now,
    updatedAt: now,
  });
  await setDoc(doc(db, "allowedEmails", member.email), {
    email: member.email,
    role: member.role,
    partnerId,
    createdAt: now,
    updatedAt: now,
  });
}

function PartnersPage() {
  const { t } = useTranslation("partners");
  const { partners, loading, createPartner, updatePartnerName, updatePartnerFeatures, deletePartner } = usePartners();
  const { partnerId } = usePartner();
  const [showCreate, setShowCreate] = useState(false);

  const handleCreate = async (name: string, member?: { email: string; role: PartnerRole }) => {
    const newId = await createPartner(name);
    if (member) {
      await addMemberToNewPartner(newId, member);
    }
  };

  return (
    <main className="flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{t("page.title")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("page.description")}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t("page.newPartner")}
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">{t("page.loading")}</p>
        ) : partners.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">{t("page.empty")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {partners.map((partner) => (
              <PartnerCard
                key={partner.id}
                partner={partner}
                onUpdateName={updatePartnerName}
                onUpdateFeatures={updatePartnerFeatures}
                onDelete={deletePartner}
              />
            ))}
          </div>
        )}
      </div>

      <CreatePartnerDialog
        partnerId={partnerId}
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreate={handleCreate}
      />
    </main>
  );
}
