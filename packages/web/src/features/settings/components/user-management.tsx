import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAllowedEmails } from "../hooks/use-allowed-emails";
import { AllowedEmailList } from "./allowed-email-list";
import { AddEmailDialog } from "./add-email-dialog";
import { Plus } from "lucide-react";

export function UserManagement() {
  const { t } = useTranslation("settings");
  const { emails, loading, addEmail, removeEmail, updateEmail } = useAllowedEmails();
  const [showDialog, setShowDialog] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">{t("users.heading")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("users.subheading")}
          </p>
        </div>
        <button
          onClick={() => setShowDialog(true)}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t("users.addUser")}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("users.loading")}</p>
      ) : (
        <AllowedEmailList
          emails={emails}
          onRemove={removeEmail}
          onUpdateRole={updateEmail}
        />
      )}

      <AddEmailDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        onSubmit={addEmail}
      />
    </div>
  );
}
