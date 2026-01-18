/**
 * @fileoverview auth_service initialization
 */

import type { AuthServiceConfig } from './types';
import { initializeFirebaseAdmin } from './helpers/FirebaseHelper';
import { initializeSiteAdminChecker } from './helpers/AdminHelper';

let initialized = false;

/**
 * Initialize auth_service with Firebase configuration.
 *
 * Call this once at application startup, before using any other auth_service functions.
 *
 * @param config - Firebase and site admin configuration
 *
 * @example
 * ```typescript
 * import { initializeAuth } from '@sudobility/auth_service';
 *
 * initializeAuth({
 *   firebase: {
 *     projectId: process.env.FIREBASE_PROJECT_ID!,
 *     clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
 *     privateKey: process.env.FIREBASE_PRIVATE_KEY!,
 *   },
 *   siteAdminEmails: process.env.SITEADMIN_EMAILS,
 * });
 * ```
 */
export function initializeAuth(config: AuthServiceConfig): void {
  if (initialized) {
    console.warn('[auth_service] Already initialized');
    return;
  }

  initializeFirebaseAdmin(config.firebase);
  initializeSiteAdminChecker(config.siteAdminEmails);
  initialized = true;
}

/**
 * Check if auth_service has been initialized.
 */
export function isAuthInitialized(): boolean {
  return initialized;
}

/**
 * Reset initialization state (for testing only).
 */
export function resetAuthInitialization(): void {
  initialized = false;
}
