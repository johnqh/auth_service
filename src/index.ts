/**
 * @fileoverview @sudobility/auth_service - Firebase authentication service for Hono backends
 *
 * This library provides:
 * - Firebase Admin SDK initialization
 * - Token verification with optional caching
 * - Site admin email whitelist checking
 * - Hono middleware for auth and admin routes
 * - User info retrieval from Firebase
 */

// Initialization
export { initializeAuth, isAuthInitialized, resetAuthInitialization } from './init';

// Types
export type {
  FirebaseAdminConfig,
  AuthServiceConfig,
  VerifiedUser,
  UserInfoResponse,
  AuthContextVariables,
  TokenVerifier,
  CachedToken,
} from './types';

// Helpers
export {
  verifyIdToken,
  isAnonymousUser,
  getFirebaseAuth,
} from './helpers/FirebaseHelper';

export { createCachedVerifier, type CachedVerifier } from './helpers/TokenCache';

export { isSiteAdmin } from './helpers/AdminHelper';

export { getUserInfo } from './helpers/UserInfoHelper';

// Middleware
export {
  createAuthMiddleware,
  createAdminMiddleware,
  createUserVerificationMiddleware,
  type AuthMiddlewareOptions,
  type UserVerificationMiddlewareOptions,
} from './middleware/hono';
