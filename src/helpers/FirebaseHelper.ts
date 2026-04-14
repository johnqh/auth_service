/**
 * @fileoverview Firebase Admin SDK wrapper for token verification and authentication.
 *
 * Provides functions to initialize Firebase Admin, retrieve the Auth instance,
 * verify ID tokens, and detect anonymous users. Must be initialized via
 * {@link initializeFirebaseAdmin} (or the top-level `initializeAuth`) before
 * any other function in this module is called.
 */

import { initializeApp, cert, getApps, type App } from "firebase-admin/app";
import { getAuth, type Auth, type DecodedIdToken } from "firebase-admin/auth";
import type { FirebaseAdminConfig } from "../types";

let firebaseApp: App | null = null;
let firebaseAuth: Auth | null = null;

/**
 * Initialize Firebase Admin SDK with the provided service account configuration.
 *
 * Safe to call multiple times -- subsequent calls are no-ops once a Firebase
 * app has been initialized. If other Firebase Admin apps already exist in the
 * process, the first existing app is reused.
 *
 * @param config - Firebase service account credentials.
 * @param config.projectId - The Firebase project ID.
 * @param config.clientEmail - The service account email address.
 * @param config.privateKey - The service account private key (may contain literal `\n` sequences).
 *
 * @example
 * ```typescript
 * initializeFirebaseAdmin({
 *   projectId: 'my-project',
 *   clientEmail: 'firebase@my-project.iam.gserviceaccount.com',
 *   privateKey: process.env.FIREBASE_PRIVATE_KEY!,
 * });
 * ```
 */
export function initializeFirebaseAdmin(config: FirebaseAdminConfig): void {
  if (firebaseApp) return;

  const existingApps = getApps();
  if (existingApps.length > 0) {
    firebaseApp = existingApps[0]!;
  } else {
    firebaseApp = initializeApp({
      credential: cert({
        projectId: config.projectId,
        clientEmail: config.clientEmail,
        privateKey: config.privateKey.replace(/\\n/g, "\n"),
      }),
    });
  }
  firebaseAuth = getAuth(firebaseApp);
}

/**
 * Get the Firebase Auth instance.
 *
 * @returns The initialized Firebase Auth instance.
 * @throws {Error} If Firebase Admin has not been initialized via
 *   {@link initializeFirebaseAdmin} or `initializeAuth`.
 *
 * @example
 * ```typescript
 * const auth = getFirebaseAuth();
 * const user = await auth.getUser(uid);
 * ```
 */
export function getFirebaseAuth(): Auth {
  if (!firebaseAuth) {
    throw new Error(
      "Firebase Admin not initialized. Call initializeAuth() first."
    );
  }
  return firebaseAuth;
}

/**
 * Verify a Firebase ID token and return the decoded payload.
 *
 * This is the **uncached** variant -- every call makes a round-trip to the
 * Firebase Auth backend. For production use consider {@link createCachedVerifier}
 * from `TokenCache` instead.
 *
 * @param token - The raw Firebase ID token string (JWT) from the client.
 * @returns The decoded token containing the user's UID, email, and other claims.
 * @throws {Error} If the token is invalid, expired, or Firebase Admin is not initialized.
 *
 * @example
 * ```typescript
 * const decoded = await verifyIdToken(bearerToken);
 * console.log(decoded.uid, decoded.email);
 * ```
 */
export async function verifyIdToken(token: string): Promise<DecodedIdToken> {
  return getFirebaseAuth().verifyIdToken(token);
}

/**
 * Check whether a decoded token belongs to an anonymous Firebase user.
 *
 * @param decodedToken - A decoded Firebase ID token (from {@link verifyIdToken}).
 * @returns `true` if the token's sign-in provider is `'anonymous'`, `false` otherwise.
 *
 * @example
 * ```typescript
 * const decoded = await verifyIdToken(token);
 * if (isAnonymousUser(decoded)) {
 *   return c.json({ error: 'Anonymous users not allowed' }, 403);
 * }
 * ```
 */
export function isAnonymousUser(decodedToken: DecodedIdToken): boolean {
  return decodedToken.firebase?.sign_in_provider === "anonymous";
}
