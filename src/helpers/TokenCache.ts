/**
 * @fileoverview Token verification caching
 */

import type { DecodedIdToken } from 'firebase-admin/auth';
import type { CachedToken, TokenVerifier } from '../types';
import { verifyIdToken as verifyWithFirebase } from './FirebaseHelper';

/** Default cache TTL: 5 minutes */
const DEFAULT_TTL_MS = 300000;

/** Cleanup interval: 1 minute */
const CLEANUP_INTERVAL_MS = 60000;

export interface CachedVerifier {
  /** Verify a token (uses cache if valid) */
  verify: TokenVerifier;
  /** Stop the cleanup interval (call in tests) */
  stop: () => void;
  /** Access to the cache (for testing) */
  cache: Map<string, CachedToken>;
}

/**
 * Create a token verifier with caching.
 *
 * @param ttlMs - Cache TTL in milliseconds (default: 5 minutes)
 * @returns Object with verify function, stop function, and cache access
 *
 * @example
 * ```typescript
 * const { verify, stop } = createCachedVerifier(300000);
 *
 * // Use in middleware
 * const decoded = await verify(token);
 *
 * // Clean up in tests
 * stop();
 * ```
 */
export function createCachedVerifier(ttlMs: number = DEFAULT_TTL_MS): CachedVerifier {
  const cache = new Map<string, CachedToken>();

  // Cleanup expired tokens periodically
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [token, cached] of cache) {
      if (cached.expiresAt <= now) {
        cache.delete(token);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  // Allow cleanup to be stopped (for tests)
  const stop = () => clearInterval(cleanupInterval);

  const verify: TokenVerifier = async (token: string): Promise<DecodedIdToken> => {
    const now = Date.now();
    const cached = cache.get(token);

    // Return cached token if still valid
    if (cached && cached.expiresAt > now) {
      return cached.decodedToken;
    }

    // Verify with Firebase and cache the result
    const decodedToken = await verifyWithFirebase(token);
    cache.set(token, {
      decodedToken,
      expiresAt: now + ttlMs,
    });

    return decodedToken;
  };

  return { verify, stop, cache };
}
