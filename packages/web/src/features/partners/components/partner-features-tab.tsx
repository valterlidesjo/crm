import { useTranslation } from "react-i18next";
import { FEATURE_KEYS, type FeatureKey } from "@crm/shared";

interface Props {
  features: Record<FeatureKey, boolean>;
  onChange: (features: Record<FeatureKey, boolean>) => void;
  saving?: boolean;
}

export function PartnerFeaturesTab({ features, onChange, saving }: Props) {
  const { t } = useTranslation("partners");
  const toggle = (key: FeatureKey) => {
    onChange({ ...features, [key]: !features[key] });
  };

  return (
    <div className="space-y-1">
      {FEATURE_KEYS.map((key) => (
        <div
          key={key}
          className="flex items-center justify-between rounded-md px-3 py-2.5 hover:bg-muted/50"
        >
          <span className="text-sm font-medium">{t(`feature.${key}`)}</span>
          <button
            type="button"
            role="switch"
            aria-checked={features[key]}
            disabled={saving}
            onClick={() => toggle(key)}
            className={[
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "disabled:cursor-not-allowed disabled:opacity-50",
              features[key] ? "bg-primary" : "bg-input",
            ].join(" ")}
          >
            <span
              className={[
                "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
                features[key] ? "translate-x-4" : "translate-x-0",
              ].join(" ")}
            />
          </button>
        </div>
      ))}
    </div>
  );
}
