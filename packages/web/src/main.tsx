import { useMemo } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { I18nextProvider } from "react-i18next";
import { routeTree } from "./routeTree.gen";
import { AuthProvider, useAuth, type AuthState } from "./lib/auth";
import { PartnerProvider } from "./lib/partner";
import { GoogleCalendarProvider } from "./lib/google-calendar";
import i18n from "./i18n/config";
import "./index.css";

const router = createRouter({
  routeTree,
  context: {
    auth: undefined!,
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
  interface RouterContext {
    auth: AuthState;
  }
}

function App() {
  const auth = useAuth();

  useMemo(() => {
    router.update({
      context: { auth },
    });
  }, [auth]);

  return <RouterProvider router={router} />;
}

createRoot(document.getElementById("root")!).render(
  // Note: StrictMode temporarily disabled due to known Firestore listener issues
  // See: https://github.com/firebase/firebase-js-sdk/issues/7689
  // <StrictMode>
    <I18nextProvider i18n={i18n}>
      <AuthProvider>
        <PartnerProvider>
          <GoogleCalendarProvider>
            <App />
          </GoogleCalendarProvider>
        </PartnerProvider>
      </AuthProvider>
    </I18nextProvider>
  // </StrictMode>
);
