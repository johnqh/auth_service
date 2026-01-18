/**
 * @fileoverview Firebase Admin SDK wrapper
 */

import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getAuth, type Auth, type DecodedIdToken } from 'firebase-admin/auth';
import type { FirebaseAdminConfig } from '../types';

let firebaseApp: App | null = null;
let firebaseAuth: Auth | null = null;

/**
 * Initialize Firebase Admin SDK with provided configuration.
 * Safe to call multiple times - will only initialize once.
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
        privateKey: config.privateKey.replace(/\\n/g, '\n'),
      }),
    });
  }
  firebaseAuth = getAuth(firebaseApp);
}

/**
 * Get the Firebase Auth instance.
 * Throws if not initialized.
 */
export function getFirebaseAuth(): Auth {
  if (!firebaseAuth) {
    throw new Error(
      'Firebase Admin not initialized. Call initializeAuth() first.'
    );
  }
  return firebaseAuth;
}

/**
 * Verify a Firebase ID token.
 * Returns the decoded token if valid.
 */
export async function verifyIdToken(token: string): Promise<DecodedIdToken> {
  return getFirebaseAuth().verifyIdToken(token);
}

/**
 * Check if a decoded token is from an anonymous user.
 */
export function isAnonymousUser(decodedToken: DecodedIdToken): boolean {
  return decodedToken.firebase?.sign_in_provider === 'anonymous';
}
