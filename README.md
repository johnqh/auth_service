# @sudobility/auth_service

Framework-agnostic Firebase authentication helpers for backend services. Provides token verification with caching, site admin checking, and user info retrieval.

## Installation

```bash
bun add @sudobility/auth_service
```

### Peer Dependencies

```bash
bun add firebase-admin @sudobility/types
```

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

### Token Verification (Hono example)

```typescript
import { createCachedVerifier, isSiteAdmin } from '@sudobility/auth_service';

const { verify: verifyToken } = createCachedVerifier(300000); // 5 min TTL

const decoded = await verifyToken(token);
const isAdmin = isSiteAdmin(decoded.email);
```

### User Info

```typescript
import { getUserInfo } from '@sudobility/auth_service';

const userInfo = await getUserInfo(userId);
```

## API

| Function | Description |
|----------|-------------|
| `initializeAuth(config)` | Initialize Firebase Admin SDK and site admin list |
| `verifyIdToken(token)` | Verify Firebase ID token (no caching) |
| `createCachedVerifier(ttl)` | Create cached token verifier (returns `{ verify, stop, cache }`) |
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

## Development

```bash
bun run build        # Build to dist/
bun run verify       # All checks + build
bun test             # Run tests
bun run typecheck    # TypeScript check
bun run lint         # Run ESLint
```

## License

BUSL-1.1
