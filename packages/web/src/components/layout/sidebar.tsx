import { useState, useCallback } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  Users,
  Kanban,
  Calendar,
  Receipt,
  FileText,
  Calculator,
  UserCog,
  Settings,
  Building2,
  LogOut,
  Package,
  ShoppingCart,
  PanelLeftClose,
  PanelLeftOpen,
  ShoppingBag,
  Eye,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage, type Language } from "@/i18n";
import { useUserRole, useIsSuperAdmin, signOut } from "@/lib/auth";
import { usePartner } from "@/lib/partner";
import type { FeatureKey, UserRole } from "@crm/shared";

const STORAGE_KEY = "crm-sidebar-collapsed";

// `key` indexes the "nav" i18n namespace; it is also the stable React key.
const navigation: {
  key: string;
  href: string;
  icon: React.ElementType;
  roles: UserRole[];
  feature: FeatureKey;
}[] = [
  { key: "dashboard", href: "/", icon: LayoutDashboard, roles: ["admin", "user"], feature: "dashboard" },
  { key: "customers", href: "/customers", icon: Users, roles: ["admin", "user"], feature: "customers" },
  { key: "pipeline", href: "/pipeline", icon: Kanban, roles: ["admin", "user"], feature: "pipeline" },
  { key: "meetings", href: "/meetings", icon: Calendar, roles: ["admin", "user"], feature: "meetings" },
  { key: "invoicing", href: "/invoicing", icon: Receipt, roles: ["admin"], feature: "invoicing" },
  { key: "quotes", href: "/quotes", icon: FileText, roles: ["admin", "user"], feature: "quotes" },
  { key: "accounting", href: "/accounting", icon: Calculator, roles: ["admin"], feature: "accounting" },
  { key: "inventory", href: "/inventory", icon: Package, roles: ["admin", "user"], feature: "inventory" },
  { key: "orders", href: "/orders", icon: ShoppingBag, roles: ["admin", "user"], feature: "orders" },
  { key: "purchaseOrders", href: "/purchase-orders", icon: ShoppingCart, roles: ["admin"], feature: "purchaseOrders" },
  { key: "profile", href: "/profile", icon: UserCog, roles: ["admin", "user"], feature: "profile" },
];

/*
 * Sidebar state machine:
 *
 *   EXPANDED (w-64)  ←──toggle──→  COLLAPSED (w-12, icons only)
 *        ↑                                ↑
 *   localStorage "false" / missing   localStorage "true"
 *
 * Emulation mode (superAdmin only):
 *   - Banner replaces header, shows partner name + exit button
 *   - ALL nav items shown regardless of feature toggles
 *   - Items with feature disabled show a gray "off" dot indicator
 *   - SuperAdmin nav section (Partners, Settings, Shopify) is hidden
 */
export function Sidebar() {
  const { t } = useTranslation(["nav", "common"]);
  const { language, setLanguage, languages } = useLanguage();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(STORAGE_KEY) === "true"
  );

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const userRole = useUserRole();
  const isSuperAdmin = useIsSuperAdmin();
  const { isFeatureEnabled, isReallyEnabled, isEmulating, emulatedPartnerName, stopEmulation } = usePartner();
  const navigate = useNavigate();

  // During emulation: show all nav items (filtered only by role).
  // Not emulating: filter by both role and feature enabled.
  const visibleNavigation = navigation.filter((item) => {
    if (!userRole || !item.roles.includes(userRole)) return false;
    return isEmulating ? true : isFeatureEnabled(item.feature);
  });

  const navLinkClass = (isActive: boolean, featureOff?: boolean) =>
    cn(
      "flex items-center rounded-md py-2 text-sm font-medium transition-colors",
      collapsed ? "justify-center" : "gap-3 px-3",
      isActive
        ? "bg-sidebar-accent text-sidebar-foreground"
        : featureOff
          ? "text-muted-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground/70"
          : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
    );

  const handleExitEmulation = () => {
    stopEmulation();
    navigate({ to: "/partners" });
  };

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200",
        collapsed ? "w-12" : "w-64"
      )}
    >
      {/* Header / Emulation banner */}
      {isEmulating ? (
        <div
          className={cn(
            "flex h-14 items-center gap-2 border-b border-blue-400/40 bg-blue-50/80 dark:bg-blue-950/30",
            collapsed ? "justify-center px-2" : "px-3"
          )}
        >
          {collapsed ? (
            <button
              onClick={handleExitEmulation}
              title={`${t("common:emulation.exit")}: ${emulatedPartnerName ?? t("common:emulation.unknownPartner")}`}
              className="rounded p-1 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
            >
              <Eye className="h-4 w-4 shrink-0" />
            </button>
          ) : (
            <>
              <Eye className="h-4 w-4 shrink-0 text-blue-600" />
              <span className="flex-1 truncate text-xs font-semibold text-blue-700 dark:text-blue-400">
                {emulatedPartnerName ?? t("common:emulation.unknownPartner")}
              </span>
              <button
                onClick={handleExitEmulation}
                title={t("common:emulation.exit")}
                className="rounded p-1 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="flex h-14 items-center border-b border-sidebar-border px-3">
          {!collapsed && (
            <h1 className="flex-1 text-lg font-semibold text-sidebar-foreground">{t("common:brand")}</h1>
          )}
          <button
            onClick={toggle}
            title={collapsed ? t("common:actions.openMenu") : t("common:actions.closeMenu")}
            className={cn(
              "rounded-md p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors",
              collapsed && "w-full flex justify-center"
            )}
          >
            {collapsed
              ? <PanelLeftOpen className="h-4 w-4" />
              : <PanelLeftClose className="h-4 w-4" />
            }
          </button>
        </div>
      )}

      {/* Nav */}
      <nav className={cn("flex-1 space-y-1 py-3", collapsed ? "px-1" : "px-3")}>
        {visibleNavigation.map((item) => {
          const isActive =
            item.href === "/"
              ? currentPath === "/"
              : currentPath.startsWith(item.href);
          const featureOff = isEmulating && !isReallyEnabled(item.feature);
          const label = t(`nav:${item.key}`);
          return (
            <Link
              key={item.key}
              to={item.href}
              title={
                collapsed
                  ? featureOff
                    ? t("common:emulation.featureDisabledShort", { name: label })
                    : label
                  : featureOff
                    ? t("common:emulation.featureDisabledLong", { name: label })
                    : undefined
              }
              className={navLinkClass(isActive, featureOff)}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && (
                <span className="flex-1">{label}</span>
              )}
              {!collapsed && featureOff && (
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" title={t("common:emulation.featureDisabled")} />
              )}
            </Link>
          );
        })}

        {/* SuperAdmin section — hidden during emulation */}
        {isSuperAdmin && !isEmulating && (
          <>
            <div className="my-2 border-t border-sidebar-border" />
            <Link
              to="/settings"
              title={collapsed ? t("nav:settings") : undefined}
              className={navLinkClass(currentPath.startsWith("/settings"))}
            >
              <Settings className="h-4 w-4 shrink-0" />
              {!collapsed && t("nav:settings")}
            </Link>
            <Link
              to="/partners"
              title={collapsed ? t("nav:partners") : undefined}
              className={navLinkClass(currentPath.startsWith("/partners"))}
            >
              <Building2 className="h-4 w-4 shrink-0" />
              {!collapsed && t("nav:partners")}
            </Link>
            <Link
              to="/superadmin/shopify"
              title={collapsed ? t("nav:shopify") : undefined}
              className={navLinkClass(currentPath.startsWith("/superadmin/shopify"))}
            >
              <ShoppingBag className="h-4 w-4 shrink-0" />
              {!collapsed && t("nav:shopify")}
            </Link>
          </>
        )}
      </nav>

      {/* Footer */}
      <div className={cn("border-t border-sidebar-border py-3", collapsed ? "px-1" : "px-3")}>
        {isEmulating && !collapsed && (
          <button
            onClick={handleExitEmulation}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-400 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            {t("common:emulation.exit")}
          </button>
        )}
        {!collapsed && !isEmulating && (
          <div className="mb-3 flex justify-center">
            <img src="/logo.png" alt={t("common:brand")} className="h-32 w-full object-contain" />
          </div>
        )}
        {/* Language switcher */}
        {!collapsed ? (
          <div className="mb-2 flex items-center gap-1 rounded-md border border-sidebar-border p-0.5">
            {languages.map((lng: Language) => (
              <button
                key={lng}
                onClick={() => setLanguage(lng)}
                className={cn(
                  "flex-1 rounded px-2 py-1 text-xs font-medium uppercase transition-colors",
                  language === lng
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-muted-foreground hover:text-sidebar-foreground"
                )}
              >
                {lng}
              </button>
            ))}
          </div>
        ) : (
          <button
            onClick={() => setLanguage(language === "sv" ? "en" : "sv")}
            title={t("common:language.label")}
            className="mb-2 flex w-full justify-center rounded-md py-1 text-xs font-medium uppercase text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
          >
            {language}
          </button>
        )}
        <button
          onClick={() => signOut()}
          title={collapsed ? t("common:actions.logout") : undefined}
          className={cn(
            "flex w-full items-center rounded-md py-2 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors",
            collapsed ? "justify-center" : "gap-3 px-3"
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && t("common:actions.logout")}
        </button>
      </div>
    </aside>
  );
}
