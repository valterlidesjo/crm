import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageContainer } from "@/components/layout/page-container";
import { useDashboardStats } from "@/features/dashboard/hooks/use-dashboard-stats";
import { useCompanyProfile } from "@/features/profile/hooks/use-profile";
import { GoalProgressCard } from "@/features/dashboard/components/goal-progress-card";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePartner } from "@/lib/partner";
import {
  KPI_CATALOG,
  DEFAULT_DASHBOARD_KPIS,
  type KpiId,
} from "@/features/dashboard/utils/kpi-catalog";
import type { DashboardPeriod } from "@/features/accounting/utils/period-range";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

// `labelKey` indexes the "dashboard:period" i18n namespace.
const PERIOD_OPTIONS: { value: DashboardPeriod; labelKey: string }[] = [
  { value: "last-30-days", labelKey: "period.last30Days" },
  { value: "last-90-days", labelKey: "period.last90Days" },
  { value: "last-365-days", labelKey: "period.last365Days" },
  { value: "all-time", labelKey: "period.allTime" },
];

// KPI ids are snake_case stable identifiers; i18n keys are lowerCamelCase.
const kpiI18nKey = (id: KpiId): string =>
  id.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">
        {loading ? "—" : value}
      </p>
    </div>
  );
}

function Dashboard() {
  const { t } = useTranslation("dashboard");
  const [period, setPeriod] = useState<DashboardPeriod>("last-30-days");
  const { dashboardKpis } = usePartner();
  const stats = useDashboardStats(period);
  const { profile, loading: profileLoading } = useCompanyProfile();

  // null = partner doc still loading; empty array = misconfigured → both fall back to defaults
  const enabledKpis: KpiId[] =
    !dashboardKpis || dashboardKpis.length === 0
      ? DEFAULT_DASHBOARD_KPIS
      : (dashboardKpis.filter((id) => id in KPI_CATALOG) as KpiId[]);

  const kpiValues: Record<KpiId, string> = {
    shopify_revenue: formatCurrency(stats.shopifyRevenue),
    shopify_orders: stats.shopifyOrders.toString(),
    inventory_retail_value: formatCurrency(stats.inventoryRetailValue),
    inventory_cost_value: formatCurrency(stats.inventoryCostValue),
    inventory_units: stats.inventoryUnits.toString(),
    total_income: formatCurrency(stats.totalIncome),
    active_customers: stats.activeCustomers.toString(),
    mrr: formatCurrency(stats.mrr),
    meetings_this_week: stats.meetingsThisWeek.toString(),
  };

  // Show the period toggle only if at least one enabled KPI is time-sensitive
  const showPeriodToggle = enabledKpis.some((id) => KPI_CATALOG[id].timeSensitive);

  return (
    <PageContainer
      title={t("title")}
      description={t("description")}
    >
      {showPeriodToggle && (
        <div className="flex gap-1 mb-4">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={cn(
                "px-3 py-1 text-sm rounded-md transition-colors",
                period === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {enabledKpis.map((id) => (
          <StatCard
            key={id}
            label={t(`kpi.${kpiI18nKey(id)}.label`)}
            value={kpiValues[id]}
            loading={stats.loading}
          />
        ))}
      </div>

      <div className="mt-6">
        {profileLoading ? (
          <div className="rounded-lg border border-border bg-background p-6">
            <p className="text-sm text-muted-foreground">{t("goals.loading")}</p>
          </div>
        ) : (
          <GoalProgressCard
            profile={profile}
            currentIncome={stats.totalIncome}
            currentMrr={stats.mrr}
          />
        )}
      </div>
    </PageContainer>
  );
}
