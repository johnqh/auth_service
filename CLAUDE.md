# Auth Service

Framework-agnostic Firebase authentication helpers.

**npm**: `@sudobility/auth_service` (public)

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Runtime**: Bun
- **Package Manager**: Bun (do not use npm/yarn/pnpm for installing dependencies)
- **Build**: TypeScript compiler (ESM)
- **Test**: Vitest
- **Auth**: Firebase Admin SDK

## Project Structure

```
src/
├── index.ts              # Main exports
├── init.ts               # Initialization function
├── types/
│   └── index.ts          # Type definitions
└── helpers/
    ├── index.ts          # Helper exports
    ├── FirebaseHelper.ts # Firebase Admin SDK wrapper
    ├── TokenCache.ts     # Token verification caching
    ├── AdminHelper.ts    # Site admin checking
    └── UserInfoHelper.ts # User info retrieval
```

## Commands

```bash
bun run build        # Build to dist/
bun run verify       # All checks + build (use before commit)
bun test             # Run tests
bun run typecheck    # TypeScript check
bun run lint         # Run ESLint
bun run clean        # Remove dist/
```

## Key Features

- Firebase Admin SDK initialization
- Token verification with optional caching
- Site admin email whitelist checking
- User info retrieval from Firebase
- Framework-agnostic (works with Hono, Express, Fastify, etc.)

## Usage

### Initialization

```typescript
import { initializeAuth } from '@sudobility/auth_service';

initializeAuth({
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID!,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
    privateKey: process.env.FIREBASE_PRIVATE_KEY!,
  },
  siteAdminEmails: process.env.SITEADMIN_EMAILS,
});
```

### Building Your Own Middleware (Hono example)

```typescript
import {
  createCachedVerifier,
  isSiteAdmin,
  isAnonymousUser,
} from '@sudobility/auth_service';
import type { Context, Next } from 'hono';

// Create cached verifier (5 min TTL)
const { verify: verifyToken } = createCachedVerifier(300000);

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    return c.json({ error: 'Authorization header required' }, 401);
  }

  const [type, token] = authHeader.split(' ');
  if (type !== 'Bearer' || !token) {
    return c.json({ error: 'Invalid authorization format' }, 401);
  }

  try {
    const decoded = await verifyToken(token);

    if (isAnonymousUser(decoded)) {
      return c.json({ error: 'Anonymous users not allowed' }, 403);
    }

    c.set('firebaseUser', decoded);
    c.set('userId', decoded.uid);
    c.set('userEmail', decoded.email ?? null);
    c.set('siteAdmin', isSiteAdmin(decoded.email));

    await next();
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
}
```

### User Info Endpoint

```typescript
import { getUserInfo } from '@sudobility/auth_service';

app.get('/api/v1/users/:userId', authMiddleware, async (c) => {
  const userId = c.req.param('userId');
  const tokenUserId = c.get('userId');

  if (userId !== tokenUserId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const userInfo = await getUserInfo(userId);
  if (!userInfo) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({ data: userInfo });
});
```

## Exported Functions

| Function | Description |
|----------|-------------|
| `initializeAuth(config)` | Initialize Firebase Admin SDK and site admin list |
| `verifyIdToken(token)` | Verify Firebase ID token (no caching) |
| `createCachedVerifier(ttl)` | Create cached token verifier |
| `isSiteAdmin(email)` | Check if email is a site admin |
| `isAnonymousUser(token)` | Check if token is from anonymous user |
| `getUserInfo(userId)` | Get user info from Firebase |
| `getFirebaseAuth()` | Get Firebase Auth instance |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account email |
| `FIREBASE_PRIVATE_KEY` | Firebase service account private key |
| `SITEADMIN_EMAILS` | Comma-separated list of site admin emails |

## Peer Dependencies

Required in consuming app:
- `firebase-admin` - Firebase Admin SDK
- `@sudobility/types` - Shared types

## Publishing

```bash
bun run verify       # All checks
npm publish          # Publish to npm
```

## Architecture

```
auth_service (this package)
    ↑
shapeshyft_api (backend)
sudojo_api (backend)
whisperly_api (backend)
```

## Code Patterns

### Token Caching
```typescript
// Create verifier with 5 minute cache
const { verify, stop, cache } = createCachedVerifier(300000);

// Use in middleware
const decoded = await verify(token);

// Stop cleanup interval (for tests)
stop();
```
