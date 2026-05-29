import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import type { PlatformRole, UserRole } from "@crm/shared";

export type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "denied"; email: string }
  | { status: "authenticated"; user: User; role: UserRole; email: string; partnerId: string; platformRole: PlatformRole | null };

const AuthContext = createContext<AuthState>({ status: "loading" });

const googleProvider = new GoogleAuthProvider();

// Module-level state to survive the onAuthStateChanged re-fire after sign-out
let deniedEmail: string | null = null;

async function getUserPermissions(
  email: string
): Promise<{ allowed: boolean; role: UserRole | null; partnerId: string | null; platformRole: PlatformRole | null }> {
  const docRef = doc(db, "allowedEmails", email);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return { allowed: false, role: null, partnerId: null, platformRole: null };
  }

  const data = docSnap.data();
  return {
    allowed: true,
    role: (data.role as UserRole) || "user",
    partnerId: (data.partnerId as string) || null,
    platformRole: (data.platformRole as PlatformRole) || null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() =>
    import.meta.env.VITE_DISABLE_AUTH === "true"
      ? {
          status: "authenticated",
          user: { email: "test@test.com" } as User,
          role: "admin",
          email: "test@test.com",
          partnerId: import.meta.env.VITE_DEV_PARTNER_ID || "dev",
          platformRole: "superAdmin",
        }
      : { status: "loading" }
  );

  useEffect(() => {
    if (import.meta.env.VITE_DISABLE_AUTH === "true") return;

    return onAuthStateChanged(auth, async (user) => {
      if (!user?.email || !user?.uid) {
        setState(
          deniedEmail
            ? { status: "denied", email: deniedEmail }
            : { status: "unauthenticated" },
        );
        return;
      }

      const { allowed, role, partnerId, platformRole } = await getUserPermissions(user.email);
      if (!allowed) {
        deniedEmail = user.email;
        await firebaseSignOut(auth);
        return;
      }

      deniedEmail = null;
      setState({
        status: "authenticated",
        user,
        role: role!,
        email: user.email,
        partnerId: partnerId || "default",
        platformRole,
      });
    });
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useUserRole(): UserRole | null {
  const auth = useAuth();
  return auth.status === "authenticated" ? auth.role : null;
}

export function useIsAdmin(): boolean {
  const auth = useAuth();
  return auth.status === "authenticated" && auth.role === "admin";
}

export function useIsSuperAdmin(): boolean {
  const auth = useAuth();
  return auth.status === "authenticated" && auth.platformRole === "superAdmin";
}

export async function signIn() {
  await signInWithPopup(auth, googleProvider);
}

export async function signOut() {
  deniedEmail = null;
  await firebaseSignOut(auth);
}
