import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageContainer } from "@/components/layout/page-container";
import { AccountList } from "@/features/accounting/components/account-list";
import { requireAdmin } from "@/lib/route-guards";

export const Route = createFileRoute("/accounting/accounts")({
  beforeLoad: ({ context }) => requireAdmin(context.auth),
  component: AccountsPage,
});

function AccountsPage() {
  const { t } = useTranslation("accounting");
  return (
    <PageContainer
      title={t("accounts.title")}
      description={t("accounts.description")}
    >
      <AccountList />
    </PageContainer>
  );
}
