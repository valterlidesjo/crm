import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageContainer } from "@/components/layout/page-container";
import { useCustomers } from "@/features/customers/hooks/use-customers";
import { PipelineBoard } from "@/features/pipeline/components/pipeline-board";

export const Route = createFileRoute("/pipeline/")({
  component: PipelinePage,
});

function PipelinePage() {
  const { t } = useTranslation("pipeline");
  const { customers, loading, updateCustomerStatus } = useCustomers();

  return (
    <PageContainer
      title={t("page.title")}
      description={t("page.description")}
    >
      <PipelineBoard
        customers={customers}
        loading={loading}
        onUpdateStatus={updateCustomerStatus}
      />
    </PageContainer>
  );
}
