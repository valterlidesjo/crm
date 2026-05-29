import type { CompanyProfile } from "@crm/shared";
import { useTranslation, Trans } from "react-i18next";
import { formatCurrency, formatDate, getDaysRemaining } from "@/lib/format";

interface GoalProgressCardProps {
  profile: CompanyProfile | null;
  currentIncome: number;
  currentMrr: number;
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;

  return (
    <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full bg-primary transition-all duration-500"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

function GoalSection({
  title,
  current,
  target,
}: {
  title: string;
  current: number;
  target: number;
}) {
  const percentage = target > 0 ? Math.round((current / target) * 100) : 0;

  return (
    <div className="flex-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-sm font-semibold text-primary">{percentage}%</span>
      </div>
      <ProgressBar value={current} max={target} />
      <p className="mt-2 text-sm text-muted-foreground">
        {formatCurrency(current)} / {formatCurrency(target)}
      </p>
    </div>
  );
}

export function GoalProgressCard({
  profile,
  currentIncome,
  currentMrr,
}: GoalProgressCardProps) {
  const { t } = useTranslation("dashboard");
  const hasGoals = profile?.incomeGoal || profile?.mrrGoal;

  if (!hasGoals) {
    return (
      <div className="rounded-lg border border-border bg-background p-6">
        <h2 className="text-lg font-semibold mb-4">{t("goals.heading")}</h2>
        <p className="text-sm text-muted-foreground">
          <Trans
            i18nKey="goals.empty"
            ns="dashboard"
            components={[
              <a href="/profile" className="text-primary underline" />,
            ]}
          />
        </p>
      </div>
    );
  }

  const daysRemaining = profile?.goalDeadline
    ? getDaysRemaining(profile.goalDeadline)
    : null;

  return (
    <div className="rounded-lg border border-border bg-background p-6">
      <h2 className="text-lg font-semibold mb-6">{t("goals.heading")}</h2>

      <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
        {profile?.incomeGoal && (
          <GoalSection
            title={t("goals.incomeGoal")}
            current={currentIncome}
            target={profile.incomeGoal}
          />
        )}
        {profile?.mrrGoal && (
          <GoalSection
            title={t("goals.mrrGoal")}
            current={currentMrr}
            target={profile.mrrGoal}
          />
        )}
      </div>

      {profile?.goalDeadline && (
        <div className="mt-6 pt-6 border-t border-border">
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">{t("goals.deadline")}</span>
              <span className="font-medium">{formatDate(profile.goalDeadline)}</span>
            </div>
            {daysRemaining !== null && (
              <div>
                <span className="text-muted-foreground">{t("goals.daysRemaining")}</span>
                <span
                  className={`font-medium ${daysRemaining < 0 ? "text-destructive" : daysRemaining < 30 ? "text-yellow-600" : ""}`}
                >
                  {daysRemaining < 0
                    ? t("goals.daysOverdue", { count: Math.abs(daysRemaining) })
                    : daysRemaining}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {profile?.goalDescription && (
        <div className="mt-6 pt-6 border-t border-border">
          <h3 className="text-sm font-medium mb-2">{t("goals.achieveHeading")}</h3>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {profile.goalDescription}
          </p>
        </div>
      )}
    </div>
  );
}
