# auth_service Implementation Plan

## Overview

Create `@sudobility/auth_service` - a shared backend library for Firebase authentication and site admin checking. This library will replace duplicated auth code across shapeshyft_api, sudojo_api, and whisperly_api.

## Design Decisions

| Decision | Choice |
|----------|--------|
| Package type | Library (not standalone microservice) |
| Package name | `@sudobility/auth_service` |
| Exposure | Hono middleware + helper functions |
| Firebase init | Consuming API passes config to `initializeAuth()` |
| Token caching | Optional via `createCachedVerifier(ttlMs)` |
| Cache TTL | 5 minutes (300000ms) in all APIs |
| Admin env var | `SITEADMIN_EMAILS` |
| User mismatch | Return 403 Forbidden |
| Endpoint response | Full Firebase user info + siteAdmin boolean |

## Project Structure

```
auth_service/
├── package.json
├── tsconfig.json
├── tsconfig.esm.json
├── CLAUDE.md
├── plans/
│   └── FIREBASE.md (this file)
└── src/
    ├── index.ts                 # Main exports
    ├── types/
    │   └── index.ts             # Type definitions
    ├── helpers/
    │   ├── index.ts             # Helper exports
    │   ├── FirebaseHelper.ts    # Firebase Admin SDK wrapper
    │   ├── TokenCache.ts        # Token verification caching
    │   └── AdminHelper.ts       # Site admin checking (uses auth_lib)
    └── middleware/
        ├── index.ts             # Middleware exports
        └── hono.ts              # Hono middleware factories
```

## Type Definitions

### src/types/index.ts

```typescript
import type { DecodedIdToken } from 'firebase-admin/auth';

/** Firebase Admin SDK configuration */
export interface FirebaseAdminConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/** auth_service initialization options */
export interface AuthServiceConfig {
  firebase: FirebaseAdminConfig;
  siteAdminEmails?: string; // Comma-separated list
  tokenCacheTtlMs?: number; // Default: 300000 (5 min)
}

/** Verified user information */
export interface VerifiedUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
  siteAdmin: boolean;
  decodedToken: DecodedIdToken;
}

/** User info response for GET /user/:userId endpoint */
export interface UserInfoResponse {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
  siteAdmin: boolean;
  photoURL: string | null;
  phoneNumber: string | null;
  disabled: boolean;
  metadata: {
    creationTime: string | null;
    lastSignInTime: string | null;
  };
}

/** Hono context variables set by auth middleware */
export interface AuthContextVariables {
  firebaseUser: DecodedIdToken;
  userId: string;
  userEmail: string | null;
  siteAdmin: boolean;
}
```

## Helper Implementations

### src/helpers/FirebaseHelper.ts

```typescript
import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getAuth, type Auth, type DecodedIdToken } from 'firebase-admin/auth';
import type { FirebaseAdminConfig } from '../types';

let firebaseApp: App | null = null;
let firebaseAuth: Auth | null = null;

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

export function getAuth(): Auth {
  if (!firebaseAuth) {
    throw new Error('Firebase Admin not initialized. Call initializeAuth() first.');
  }
  return firebaseAuth;
}

export async function verifyIdToken(token: string): Promise<DecodedIdToken> {
  return getAuth().verifyIdToken(token);
}

export function isAnonymousUser(decodedToken: DecodedIdToken): boolean {
  return decodedToken.firebase?.sign_in_provider === 'anonymous';
}
```

### src/helpers/TokenCache.ts

```typescript
import type { DecodedIdToken } from 'firebase-admin/auth';
import { verifyIdToken as verifyWithFirebase } from './FirebaseHelper';

interface CachedToken {
  decodedToken: DecodedIdToken;
  expiresAt: number;
}

export function createCachedVerifier(ttlMs: number = 300000) {
  const cache = new Map<string, CachedToken>();

  // Cleanup expired tokens every minute
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [token, cached] of cache) {
      if (cached.expiresAt <= now) {
        cache.delete(token);
      }
    }
  }, 60000);

  // Allow cleanup to be stopped (for tests)
  const stop = () => clearInterval(cleanup);

  const verify = async (token: string): Promise<DecodedIdToken> => {
    const now = Date.now();
    const cached = cache.get(token);

    if (cached && cached.expiresAt > now) {
      return cached.decodedToken;
    }

    const decodedToken = await verifyWithFirebase(token);
    cache.set(token, {
      decodedToken,
      expiresAt: now + ttlMs,
    });

    return decodedToken;
  };

  return { verify, stop, cache };
}
```

### src/helpers/AdminHelper.ts

```typescript
import { createAdminChecker } from '@sudobility/auth_lib';

let siteAdminChecker: ((email: string | null | undefined) => boolean) | null = null;

export function initializeSiteAdminChecker(emails: string | undefined): void {
  siteAdminChecker = createAdminChecker(emails);
}

export function isSiteAdmin(email: string | null | undefined): boolean {
  if (!siteAdminChecker) {
    return false;
  }
  return siteAdminChecker(email);
}
```

## Middleware Implementations

### src/middleware/hono.ts

```typescript
import type { Context, Next, MiddlewareHandler } from 'hono';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { isAnonymousUser } from '../helpers/FirebaseHelper';
import { isSiteAdmin } from '../helpers/AdminHelper';

export interface AuthMiddlewareOptions {
  /** Token verifier function (use createCachedVerifier) */
  verifyToken: (token: string) => Promise<DecodedIdToken>;
  /** Error response factory */
  errorResponse: (message: string) => unknown;
  /** Allow anonymous users (default: false) */
  allowAnonymous?: boolean;
}

/**
 * Create auth middleware that verifies Firebase tokens
 */
export function createAuthMiddleware(options: AuthMiddlewareOptions): MiddlewareHandler {
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
 * Create admin-only middleware
 */
export function createAdminMiddleware(options: AuthMiddlewareOptions): MiddlewareHandler {
  const authMiddleware = createAuthMiddleware(options);

  return async (c: Context, next: Next) => {
    // First run auth middleware
    const authResult = await authMiddleware(c, async () => {});
    if (authResult) return authResult; // Auth failed

    // Check admin status
    const siteAdmin = c.get('siteAdmin');
    if (!siteAdmin) {
      return c.json(options.errorResponse('Site admin access required'), 403);
    }

    await next();
  };
}

/**
 * Create middleware that verifies token belongs to requested user
 * Use for GET /user/:userId endpoint
 */
export function createUserVerificationMiddleware(
  options: AuthMiddlewareOptions & { userIdParam?: string }
): MiddlewareHandler {
  const { userIdParam = 'userId' } = options;
  const authMiddleware = createAuthMiddleware(options);

  return async (c: Context, next: Next) => {
    // First run auth middleware
    const authResult = await authMiddleware(c, async () => {});
    if (authResult) return authResult; // Auth failed

    // Verify user ID matches
    const requestedUserId = c.req.param(userIdParam);
    const tokenUserId = c.get('userId');

    if (requestedUserId !== tokenUserId) {
      return c.json(
        options.errorResponse('Token does not match requested user'),
        403
      );
    }

    await next();
  };
}
```

### src/helpers/UserInfoHelper.ts

```typescript
import { getAuth } from './FirebaseHelper';
import { isSiteAdmin } from './AdminHelper';
import type { UserInfoResponse } from '../types';

/**
 * Get full user info from Firebase Admin SDK
 */
export async function getUserInfo(userId: string): Promise<UserInfoResponse | null> {
  try {
    const auth = getAuth();
    const userRecord = await auth.getUser(userId);

    return {
      uid: userRecord.uid,
      email: userRecord.email ?? null,
      displayName: userRecord.displayName ?? null,
      emailVerified: userRecord.emailVerified,
      siteAdmin: isSiteAdmin(userRecord.email),
      photoURL: userRecord.photoURL ?? null,
      phoneNumber: userRecord.phoneNumber ?? null,
      disabled: userRecord.disabled,
      metadata: {
        creationTime: userRecord.metadata.creationTime ?? null,
        lastSignInTime: userRecord.metadata.lastSignInTime ?? null,
      },
    };
  } catch (error: unknown) {
    // User not found in Firebase
    if (error && typeof error === 'object' && 'code' in error) {
      if ((error as { code: string }).code === 'auth/user-not-found') {
        return null;
      }
    }
    throw error;
  }
}
```

## Main Exports

### src/index.ts

```typescript
// Initialization
export { initializeAuth } from './init';

// Types
export type {
  FirebaseAdminConfig,
  AuthServiceConfig,
  VerifiedUser,
  UserInfoResponse,
  AuthContextVariables,
} from './types';

// Helpers
export {
  verifyIdToken,
  isAnonymousUser,
  getFirebaseAuth,
} from './helpers/FirebaseHelper';

export { createCachedVerifier } from './helpers/TokenCache';
export { isSiteAdmin } from './helpers/AdminHelper';
export { getUserInfo } from './helpers/UserInfoHelper';

// Middleware
export {
  createAuthMiddleware,
  createAdminMiddleware,
  createUserVerificationMiddleware,
  type AuthMiddlewareOptions,
} from './middleware/hono';
```

### src/init.ts

```typescript
import type { AuthServiceConfig } from './types';
import { initializeFirebaseAdmin } from './helpers/FirebaseHelper';
import { initializeSiteAdminChecker } from './helpers/AdminHelper';

let initialized = false;

export function initializeAuth(config: AuthServiceConfig): void {
  if (initialized) {
    console.warn('[auth_service] Already initialized');
    return;
  }

  initializeFirebaseAdmin(config.firebase);
  initializeSiteAdminChecker(config.siteAdminEmails);
  initialized = true;
}
```

## Integration Examples

### shapeshyft_api Integration

**src/services/auth.ts** (new file)

```typescript
import {
  initializeAuth,
  createCachedVerifier,
  createAuthMiddleware,
  createUserVerificationMiddleware,
  getUserInfo,
} from '@sudobility/auth_service';
import { errorResponse } from '@sudobility/shapeshyft_types';

// Initialize once at startup
initializeAuth({
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID!,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
    privateKey: process.env.FIREBASE_PRIVATE_KEY!,
  },
  siteAdminEmails: process.env.SITEADMIN_EMAILS,
});

// Create cached verifier (5 min TTL)
const { verify: verifyToken } = createCachedVerifier(300000);

// Export middleware
export const firebaseAuthMiddleware = createAuthMiddleware({
  verifyToken,
  errorResponse,
});

export const userVerificationMiddleware = createUserVerificationMiddleware({
  verifyToken,
  errorResponse,
});

export { getUserInfo };
```

**src/routes/users.ts** (update)

```typescript
import { Hono } from 'hono';
import { userVerificationMiddleware, getUserInfo } from '../services/auth';
import { successResponse, errorResponse } from '@sudobility/shapeshyft_types';

const app = new Hono();

// GET /api/v1/users/:userId - Get user info (token must match userId)
app.get('/:userId', userVerificationMiddleware, async (c) => {
  const userId = c.req.param('userId');
  const userInfo = await getUserInfo(userId);

  if (!userInfo) {
    return c.json(errorResponse('User not found'), 403);
  }

  return c.json(successResponse(userInfo));
});

export default app;
```

## Migration Steps

### Phase 1: Create auth_service

1. Create package.json with dependencies
2. Create tsconfig.json and tsconfig.esm.json
3. Implement all source files
4. Add unit tests
5. Build and verify
6. Publish to npm

### Phase 2: Migrate shapeshyft_api

1. Add `@sudobility/auth_service` dependency
2. Add `SITEADMIN_EMAILS` to .env files
3. Create `src/services/auth.ts` using auth_service
4. Update `src/middleware/firebaseAuth.ts` to use new middleware
5. Add GET `/api/v1/users/:userId` endpoint
6. Remove `src/services/firebase.ts`
7. Test all auth flows
8. Commit and deploy

### Phase 3: Migrate sudojo_api

1. Add `@sudobility/auth_service` dependency
2. Add `SITEADMIN_EMAILS` to .env files (copy from ADMIN_EMAILS)
3. Update middleware to use auth_service
4. Add GET `/api/v1/users/:userId` endpoint
5. Remove `src/services/firebase.ts`
6. Remove `src/middleware/auth.ts`
7. Remove `@sudobility/auth_lib` if no longer needed
8. Test all auth flows
9. Commit and deploy

### Phase 4: Migrate whisperly_api

1. Add `@sudobility/auth_service` dependency
2. Add `SITEADMIN_EMAILS` to .env files
3. Update middleware to use auth_service
4. Add GET `/api/v1/users/:userId` endpoint
5. Remove `src/services/firebase.ts`
6. Test all auth flows
7. Commit and deploy

## Environment Variables

### New Variable

| Variable | Description | Example |
|----------|-------------|---------|
| `SITEADMIN_EMAILS` | Comma-separated list of site admin emails | `admin@example.com,dev@example.com` |

### Existing Variables (unchanged)

| Variable | Description |
|----------|-------------|
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account email |
| `FIREBASE_PRIVATE_KEY` | Firebase service account private key |

### .env.example Updates

Add to all three API .env.example files:

```bash
# Site Admin Emails (comma-separated)
SITEADMIN_EMAILS=admin@example.com
```

## Dependencies

### package.json

```json
{
  "name": "@sudobility/auth_service",
  "version": "1.0.0",
  "description": "Firebase authentication service for Hono backends",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./middleware/hono": {
      "import": "./dist/middleware/hono.js",
      "types": "./dist/middleware/hono.d.ts"
    }
  },
  "peerDependencies": {
    "@sudobility/auth_lib": "^1.0.0",
    "firebase-admin": "^13.0.0",
    "hono": "^4.0.0"
  },
  "devDependencies": {
    "@sudobility/auth_lib": "^1.0.0",
    "@types/bun": "latest",
    "@types/node": "^24.0.0",
    "firebase-admin": "^13.0.0",
    "hono": "^4.10.0",
    "typescript": "^5.9.0",
    "vitest": "^4.0.4"
  }
}
```

## Files to Delete After Migration

### shapeshyft_api
- `src/services/firebase.ts`

### sudojo_api
- `src/services/firebase.ts`
- `src/middleware/auth.ts`

### whisperly_api
- `src/services/firebase.ts`

## Testing Checklist

- [ ] Token verification works
- [ ] Token caching reduces Firebase calls
- [ ] Anonymous users are rejected
- [ ] Site admin emails are correctly identified
- [ ] GET /user/:userId returns correct info
- [ ] GET /user/:userId returns 403 for wrong token
- [ ] GET /user/:userId returns 403 for non-existent user
- [ ] Admin middleware blocks non-admins
- [ ] All existing auth flows work after migration
