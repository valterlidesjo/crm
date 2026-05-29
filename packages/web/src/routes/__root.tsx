import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { useTranslation } from "react-i18next";
import { Sidebar } from "@/components/layout/sidebar";
import { useAuth, signIn, signOut, type AuthState } from "@/lib/auth";

function ErrorFallback({ error }: FallbackProps) {
  const { t } = useTranslation("auth");
  const message = error instanceof Error ? error.message : t("error.unknown");
  return (
    <div className="flex flex-col items-center justify-center h-screen gap-4">
      <h2 className="text-lg font-semibold">{t("error.title")}</h2>
      <p className="text-sm text-muted-foreground">{message}</p>
      <button onClick={() => window.location.reload()} className="text-sm underline">
        {t("error.reload")}
      </button>
    </div>
  );
}

export interface RootRouteContext {
  auth: AuthState;
}

export const Route = createRootRoute({
  beforeLoad: ({ context }): RootRouteContext => {
    return context as RootRouteContext;
  },
  component: RootLayout,
});

function RootLayout() {
  const authState = useAuth();
  const { t } = useTranslation("auth");

  if (authState.status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">{t("loading")}</p>
      </div>
    );
  }

  if (authState.status === "unauthenticated" || authState.status === "denied") {
    return <LoginScreen denied={authState.status === "denied" ? authState.email : null} />;
  }

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <div className="flex h-screen">
        <Sidebar />
        <Outlet />
      </div>
    </ErrorBoundary>
  );
}

function LoginScreen({ denied }: { denied: string | null }) {
  const { t } = useTranslation(["auth", "common"]);
  return (
    <div className="flex h-screen items-center justify-center bg-muted">
      <div className="w-full max-w-sm">
        {/* Logo + brand */}
        <div className="mb-6 flex flex-col items-center">
          <img src="/logo.png" alt={t("common:brand")} className="mb-4 h-20 w-auto object-contain" />
          <h1 className="text-2xl font-semibold text-foreground">{t("common:brand")}</h1>
          <p className="mt-1 text-sm text-muted-foreground text-center">
            {t("auth:login.tagline")}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-background p-8 shadow-sm">
          {denied && (
            <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {t("auth:login.accessDenied", { email: denied })}
            </div>
          )}

          <button
            onClick={() => signIn()}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <GoogleIcon />
            {t("auth:login.signInGoogle")}
          </button>

          {denied && (
            <button
              onClick={() => signOut()}
              className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("auth:login.tryDifferent")}
            </button>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          {t("auth:login.noAccount")}{" "}
          <a href="mailto:hello@versatilecrm.com" className="underline hover:text-foreground transition-colors">
            {t("auth:login.contactUs")}
          </a>
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
