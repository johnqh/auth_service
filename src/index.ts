/**
 * @fileoverview @sudobility/auth_service - Firebase authentication helpers
 *
 * This library provides framework-agnostic helpers:
 * - Firebase Admin SDK initialization
 * - Token verification with optional caching
 * - Site admin email whitelist checking
 * - User info retrieval from Firebase
 *
 * Consuming apps build their own middleware using these helpers.
 */

// Initialization
export { initializeAuth, isAuthInitialized, resetAuthInitialization } from './init';

// Types
export type {
  FirebaseAdminConfig,
  AuthServiceConfig,
  VerifiedUser,
  UserInfoResponse,
  TokenVerifier,
  CachedToken,
} from './types';

// Helpers
export {
  verifyIdToken,
  isAnonymousUser,
  getFirebaseAuth,
} from './helpers/FirebaseHelper';

export {
  createCachedVerifier,
  type CachedVerifier,
  type CachedVerifierOptions,
} from './helpers/TokenCache';

export { isSiteAdmin } from './helpers/AdminHelper';

export { getUserInfo } from './helpers/UserInfoHelper';
