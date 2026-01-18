# Auth Service

Shared backend library for Firebase authentication and site admin checking.

**npm**: `@sudobility/auth_service` (public)

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Runtime**: Bun
- **Build**: TypeScript compiler (ESM)
- **Test**: Vitest
- **Auth**: Firebase Admin SDK
- **Framework**: Hono middleware

## Project Structure

```
src/
├── index.ts              # Main exports
├── init.ts               # Initialization function
├── types/
│   └── index.ts          # Type definitions
├── helpers/
│   ├── index.ts          # Helper exports
│   ├── FirebaseHelper.ts # Firebase Admin SDK wrapper
│   ├── TokenCache.ts     # Token verification caching
│   ├── AdminHelper.ts    # Site admin checking
│   └── UserInfoHelper.ts # User info retrieval
└── middleware/
    ├── index.ts          # Middleware exports
    └── hono.ts           # Hono middleware factories
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
- Hono middleware for auth and admin routes
- User info retrieval from Firebase

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

### Auth Middleware

```typescript
import {
  createCachedVerifier,
  createAuthMiddleware,
} from '@sudobility/auth_service';
import { errorResponse } from '@sudobility/my_types';

const { verify: verifyToken } = createCachedVerifier(300000); // 5 min cache

const authMiddleware = createAuthMiddleware({
  verifyToken,
  errorResponse,
});

app.use('/api/v1/*', authMiddleware);
```

### Admin Middleware

```typescript
import { createAdminMiddleware } from '@sudobility/auth_service';

const adminMiddleware = createAdminMiddleware({
  verifyToken,
  errorResponse,
});

app.use('/api/v1/admin/*', adminMiddleware);
```

### User Info Endpoint

```typescript
import {
  createUserVerificationMiddleware,
  getUserInfo,
} from '@sudobility/auth_service';

app.get('/api/v1/users/:userId', userVerificationMiddleware, async (c) => {
  const userId = c.req.param('userId');
  const userInfo = await getUserInfo(userId);

  if (!userInfo) {
    return c.json(errorResponse('User not found'), 403);
  }

  return c.json(successResponse(userInfo));
});
```

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
- `hono` - Web framework (for middleware)
- `@sudobility/auth_lib` - Admin email utilities

## Context Variables

Auth middleware sets these Hono context variables:

| Variable | Type | Description |
|----------|------|-------------|
| `firebaseUser` | `DecodedIdToken` | Decoded Firebase token |
| `userId` | `string` | Firebase UID |
| `userEmail` | `string \| null` | User email |
| `siteAdmin` | `boolean` | Is site admin |

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

### Error Handling
- Missing auth header: 401
- Invalid token format: 401
- Invalid/expired token: 401
- Anonymous user: 403
- Non-admin accessing admin route: 403
- Token doesn't match requested user: 403
