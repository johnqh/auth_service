/**
 * @fileoverview Hono middleware factories for Firebase authentication
 */

import type { Context, Next, MiddlewareHandler } from 'hono';
import type { DecodedIdToken } from 'firebase-admin/auth';
import type { TokenVerifier } from '../types';
import { isAnonymousUser } from '../helpers/FirebaseHelper';
import { isSiteAdmin } from '../helpers/AdminHelper';

/**
 * Options for creating auth middleware
 */
export interface AuthMiddlewareOptions {
  /** Token verifier function (use createCachedVerifier) */
  verifyToken: TokenVerifier;
  /** Error response factory - should return the error object to serialize */
  errorResponse: (message: string) => unknown;
  /** Allow anonymous users (default: false) */
  allowAnonymous?: boolean;
}

/**
 * Hono context variable map augmentation.
 * Import this module to get proper typing for context variables.
 */
declare module 'hono' {
  interface ContextVariableMap {
    firebaseUser: DecodedIdToken;
    userId: string;
    userEmail: string | null;
    siteAdmin: boolean;
  }
}

/**
 * Create authentication middleware that verifies Firebase tokens.
 *
 * Sets the following context variables on success:
 * - `firebaseUser`: The decoded Firebase token
 * - `userId`: The Firebase UID
 * - `userEmail`: The user's email (or null)
 * - `siteAdmin`: Whether the user is a site admin
 *
 * @example
 * ```typescript
 * const { verify } = createCachedVerifier(300000);
 * const authMiddleware = createAuthMiddleware({
 *   verifyToken: verify,
 *   errorResponse: (msg) => ({ success: false, error: msg }),
 * });
 *
 * app.use('/api/*', authMiddleware);
 * ```
 */
export function createAuthMiddleware(
  options: AuthMiddlewareOptions
): MiddlewareHandler {
  const { verifyToken, errorResponse, allowAnonymous = false } = options;

  return async (c: Context, next: Next) => {
    const authHeader = c.req.header('Authorization');

    if (!authHeader) {
      return c.json(errorResponse('Authorization header required'), 401);
    }

    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer' || !token) {
      return c.json(
        errorResponse('Invalid authorization format. Use: Bearer <token>'),
        401
      );
    }

    try {
      const decodedToken = await verifyToken(token);

      if (!allowAnonymous && isAnonymousUser(decodedToken)) {
        return c.json(
          errorResponse('Anonymous users cannot access this resource'),
          403
        );
      }

      c.set('firebaseUser', decodedToken);
      c.set('userId', decodedToken.uid);
      c.set('userEmail', decodedToken.email ?? null);
      c.set('siteAdmin', isSiteAdmin(decodedToken.email));

      await next();
    } catch {
      return c.json(errorResponse('Invalid or expired Firebase token'), 401);
    }
  };
}

/**
 * Create admin-only middleware.
 *
 * First verifies the Firebase token (like createAuthMiddleware),
 * then checks if the user is a site admin.
 *
 * @example
 * ```typescript
 * const adminMiddleware = createAdminMiddleware({
 *   verifyToken: verify,
 *   errorResponse: (msg) => ({ success: false, error: msg }),
 * });
 *
 * app.use('/api/admin/*', adminMiddleware);
 * ```
 */
export function createAdminMiddleware(
  options: AuthMiddlewareOptions
): MiddlewareHandler {
  const { errorResponse } = options;
  const authMiddleware = createAuthMiddleware(options);

  return async (c: Context, next: Next) => {
    // First run auth middleware
    let authCompleted = false;
    const authResult = await authMiddleware(c, async () => {
      authCompleted = true;
    });

    // If auth middleware returned a response (error), return it
    if (!authCompleted) {
      return authResult;
    }

    // Check admin status
    const admin = c.get('siteAdmin');
    if (!admin) {
      return c.json(errorResponse('Site admin access required'), 403);
    }

    await next();
  };
}

/**
 * Options for user verification middleware
 */
export interface UserVerificationMiddlewareOptions extends AuthMiddlewareOptions {
  /** URL parameter name for user ID (default: 'userId') */
  userIdParam?: string;
}

/**
 * Create middleware that verifies the token belongs to the requested user.
 *
 * Use this for endpoints like GET /user/:userId where the user should
 * only be able to access their own information.
 *
 * Returns 403 if the token's UID doesn't match the requested userId.
 *
 * @example
 * ```typescript
 * const userVerificationMiddleware = createUserVerificationMiddleware({
 *   verifyToken: verify,
 *   errorResponse: (msg) => ({ success: false, error: msg }),
 * });
 *
 * app.get('/api/users/:userId', userVerificationMiddleware, async (c) => {
 *   const userId = c.get('userId');
 *   // userId is guaranteed to match the route param
 * });
 * ```
 */
export function createUserVerificationMiddleware(
  options: UserVerificationMiddlewareOptions
): MiddlewareHandler {
  const { userIdParam = 'userId', errorResponse } = options;
  const authMiddleware = createAuthMiddleware(options);

  return async (c: Context, next: Next) => {
    // First run auth middleware
    let authCompleted = false;
    const authResult = await authMiddleware(c, async () => {
      authCompleted = true;
    });

    // If auth middleware returned a response (error), return it
    if (!authCompleted) {
      return authResult;
    }

    // Verify user ID matches
    const requestedUserId = c.req.param(userIdParam);
    const tokenUserId = c.get('userId');

    if (requestedUserId !== tokenUserId) {
      return c.json(
        errorResponse('Token does not match requested user'),
        403
      );
    }

    await next();
  };
}
