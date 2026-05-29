import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./auth";
import { DEFAULT_FEATURES, type FeatureKey, type PlatformRole, type UserRole } from "@crm/shared";

const EMULATION_ID_KEY = "crm-emulating-partner-id";
const EMULATION_NAME_KEY = "crm-emulating-partner-name";

export interface PartnerContextValue {
  partnerId: string;
  role: UserRole;
  platformRole: PlatformRole | null;
  features: Record<FeatureKey, boolean>;
  /** Ordered list of enabled KPI IDs for this partner's dashboard.
   *  Null = not yet loaded. Undefined in Firestore = use frontend defaults. */
  dashboardKpis: string[] | null;
  /** Returns true always during emulation (all nav accessible), otherwise real feature state. */
  isFeatureEnabled: (key: FeatureKey) => boolean;
  /** Always returns the partner's actual feature toggle state. Used for emulation indicators. */
  isReallyEnabled: (key: FeatureKey) => boolean;
  isEmulating: boolean;
  emulatedPartnerName: string | null;
  startEmulation: (partnerId: string, partnerName: string) => void;
  stopEmulation: () => void;
}

const PartnerContext = createContext<PartnerContextValue | null>(null);

/*
 * Emulation state machine:
 *
 *   NOT_EMULATING ──startEmulation(id, name)──▶ EMULATING(id, name)
 *        ▲                                             │
 *        └──────────stopEmulation()───────────────────┘
 *
 * sessionStorage persists emulation across page refreshes.
 * partnerId is overridden to the emulated partner's id.
 * isFeatureEnabled always returns true during emulation (all nav visible).
 * isReallyEnabled returns actual partner feature state (for indicators).
 */
export function PartnerProvider({ children }: { children: ReactNode }) {
  const authState = useAuth();

  const ownPartnerId = authState.status === "authenticated" ? authState.partnerId : null;

  // Single object so id+name are always in sync — impossible to have one without the other.
  const [emulation, setEmulation] = useState<{ id: string; name: string } | null>(() => {
    const id = sessionStorage.getItem(EMULATION_ID_KEY);
    const name = sessionStorage.getItem(EMULATION_NAME_KEY);
    return id && name ? { id, name } : null;
  });
  const [features, setFeatures] = useState<Record<FeatureKey, boolean>>(DEFAULT_FEATURES);
  // null = loading; string[] = loaded (may be empty, handled by dashboard with DEFAULT_DASHBOARD_KPIS)
  const [dashboardKpis, setDashboardKpis] = useState<string[] | null>(null);

  const canEmulate =
    authState.status === "authenticated" &&
    authState.platformRole === "superAdmin";
  // Non-superAdmins can never emulate — ignore any emulation state during render
  // (handles manual sessionStorage manipulation by non-admin users).
  const effectiveEmulation = canEmulate ? emulation : null;

  // Drop stale sessionStorage keys for non-superAdmins. No state update needed:
  // effectiveEmulation already ignores them while rendering.
  useEffect(() => {
    if (authState.status === "authenticated" && !canEmulate) {
      sessionStorage.removeItem(EMULATION_ID_KEY);
      sessionStorage.removeItem(EMULATION_NAME_KEY);
    }
  }, [authState, canEmulate]);

  const isEmulating = effectiveEmulation !== null;
  const activePartnerId = effectiveEmulation?.id ?? ownPartnerId;

  useEffect(() => {
    if (!activePartnerId) return;

    const docRef = doc(db, "partners", activePartnerId);
    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setFeatures(
            data.features
              ? { ...DEFAULT_FEATURES, ...(data.features as Record<FeatureKey, boolean>) }
              : DEFAULT_FEATURES
          );
          // Explicitly undefined in Firestore → null here, dashboard uses DEFAULT_DASHBOARD_KPIS
          setDashboardKpis(Array.isArray(data.dashboardKpis) ? (data.dashboardKpis as string[]) : null);
        } else {
          setFeatures(DEFAULT_FEATURES);
          setDashboardKpis(null);
        }
      },
      (err) => {
        console.error("Failed to load partner features:", err.message);
      }
    );

    return () => unsubscribe();
  }, [activePartnerId]);

  const startEmulation = (partnerId: string, partnerName: string) => {
    if (authState.status !== "authenticated" || authState.platformRole !== "superAdmin") return;
    sessionStorage.setItem(EMULATION_ID_KEY, partnerId);
    sessionStorage.setItem(EMULATION_NAME_KEY, partnerName);
    setEmulation({ id: partnerId, name: partnerName });
    setFeatures(DEFAULT_FEATURES);
    setDashboardKpis(null);
  };

  const stopEmulation = () => {
    sessionStorage.removeItem(EMULATION_ID_KEY);
    sessionStorage.removeItem(EMULATION_NAME_KEY);
    setEmulation(null);
  };

  const isReallyEnabled = (key: FeatureKey) => features[key] ?? true;

  const value: PartnerContextValue = {
    partnerId: activePartnerId ?? "",
    role: authState.status === "authenticated" ? authState.role : "user",
    platformRole: authState.status === "authenticated" ? authState.platformRole : null,
    features,
    dashboardKpis,
    isFeatureEnabled: (key) => (isEmulating ? true : isReallyEnabled(key)),
    isReallyEnabled,
    isEmulating,
    emulatedPartnerName: effectiveEmulation?.name ?? null,
    startEmulation,
    stopEmulation,
  };

  return (
    <PartnerContext.Provider value={value}>{children}</PartnerContext.Provider>
  );
}

export function usePartner(): PartnerContextValue {
  const ctx = useContext(PartnerContext);
  if (!ctx) {
    throw new Error("usePartner must be used inside PartnerProvider");
  }
  return ctx;
}
