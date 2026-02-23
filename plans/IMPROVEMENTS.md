# Improvement Plans for @sudobility/auth_service

## Priority 1 - High Impact

### 1. Add JSDoc to All Helpers
- `FirebaseHelper`, `TokenCache`, `AdminHelper`, `UserInfoHelper` need comprehensive JSDoc
- Document initialization requirements and error handling behavior
- Add `@example` blocks for common integration patterns (Hono, Express)

### 2. Add Token Cache Invalidation Strategy
- `TokenCache` caches verified tokens but needs configurable TTL
- Add cache size limits to prevent memory growth
- Consider LRU eviction for high-traffic scenarios

### 3. Add Integration Tests
- Test full auth flow: token verification -> user info retrieval
- Test admin email whitelist with edge cases
- Mock Firebase Admin SDK properly in tests

## Priority 2 - Medium Impact

### 4. Add Rate Limiting for Token Verification
- Repeated invalid tokens could cause excessive Firebase API calls
- Add rate limiting per IP or per token fingerprint
- Return cached rejection for known-bad tokens

### 5. Add Structured Error Types
- Replace string error messages with typed error classes
- Include error codes for programmatic handling
- Document all possible error states

### 6. Add Health Check Utility
- Provide a function to verify Firebase Admin SDK is properly initialized
- Check credential validity without making external calls
- Useful for service health endpoints

## Priority 3 - Nice to Have

### 7. Add Metrics and Observability
- Track token verification latency
- Count cache hits vs misses
- Report auth failures by type for monitoring dashboards

### 8. Support Multiple Firebase Projects
- Currently assumes a single Firebase project
- Allow initializing with multiple project credentials
- Route token verification based on project ID

### 9. Add Token Refresh Advisory
- When a token is close to expiration, suggest refresh
- Return remaining TTL in verification response
- Help clients preemptively refresh tokens
