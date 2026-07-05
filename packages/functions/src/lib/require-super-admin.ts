import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Gate a callable to platform superAdmins.
 *
 * Every privileged callable MUST go through this helper — the check used to be
 * copy-pasted per function, which is exactly how `updateShopifyInventory`
 * shipped without one. Client-side sign-out of non-allowed users is UI-only;
 * any Google account can mint a valid ID token, so `request.auth` alone is
 * NOT an authorization check.
 */
export async function requireSuperAdmin(
  request: CallableRequest<unknown>,
  action: string
): Promise<void> {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be authenticated");
  }
  const email = request.auth.token.email;
  const allowed = email
    ? await getFirestore().doc(`allowedEmails/${email}`).get()
    : null;
  if (allowed?.data()?.platformRole !== "superAdmin") {
    throw new HttpsError("permission-denied", `Only superAdmins can ${action}`);
  }
}
