/**
 * @fileoverview Token verification caching with TTL expiration and LRU eviction.
 *
 * Wraps the Firebase token verifier with an in-memory cache so that repeated
 * requests bearing the same ID token do not require a round-trip to Firebase.
 * Entries expire after a configurable TTL and the cache enforces a maximum size
 * via LRU (Least Recently Used) eviction.
 */

import type { DecodedIdToken } from "firebase-admin/auth";
import type { CachedToken, TokenVerifier } from "../types";
import { verifyIdToken as verifyWithFirebase } from "./FirebaseHelper";

/** Default cache TTL: 5 minutes */
const DEFAULT_TTL_MS = 300000;

/** Cleanup interval: 1 minute */
const CLEANUP_INTERVAL_MS = 60000;

/** Default maximum number of entries the cache will hold */
const DEFAULT_MAX_CACHE_SIZE = 1000;

/** Options for configuring the cached verifier */
export interface CachedVerifierOptions {
  /** Cache TTL in milliseconds (default: 300 000 -- 5 minutes) */
  ttlMs?: number;
  /** Maximum number of entries before LRU eviction kicks in (default: 1000) */
  maxCacheSize?: number;
}

/**
 * Object returned by {@link createCachedVerifier} containing the verify
 * function, a stop handle for the cleanup interval, and direct cache access
 * for testing.
 */
export interface CachedVerifier {
  /** Verify a token (uses cache if valid) */
  verify: TokenVerifier;
  /** Stop the cleanup interval (call in tests to prevent dangling timers) */
  stop: () => void;
  /** Direct access to the underlying cache Map (for testing/inspection) */
  cache: Map<string, CachedToken>;
}

/**
 * Create a token verifier with in-memory caching, TTL expiration, and LRU eviction.
 *
 * The returned `verify` function checks the cache first and only calls Firebase
 * when no valid cached entry exists. Expired entries are cleaned up periodically
 * by an internal `setInterval`. When the cache exceeds `maxCacheSize`, the least
 * recently used entry (the oldest entry in Map insertion order) is evicted.
 *
 * @param ttlMsOrOptions - Either a TTL in milliseconds (for backward
 *   compatibility) or a {@link CachedVerifierOptions} object. Defaults to
 *   5 minutes TTL and 1 000 max cache entries.
 * @returns A {@link CachedVerifier} with `verify`, `stop`, and `cache` members.
 *
 * @example
 * ```typescript
 * // Simple usage with default options
 * const { verify, stop } = createCachedVerifier();
 *
 * // With numeric TTL (backward-compatible)
 * const { verify, stop } = createCachedVerifier(300000);
 *
 * // With full options
 * const { verify, stop } = createCachedVerifier({
 *   ttlMs: 600000,    // 10 minutes
 *   maxCacheSize: 500, // at most 500 entries
 * });
 *
 * // Use in middleware
 * const decoded = await verify(token);
 *
 * // Clean up in tests
 * stop();
 * ```
 */
export function createCachedVerifier(
  ttlMsOrOptions?: number | CachedVerifierOptions
): CachedVerifier {
  let ttlMs: number;
  let maxCacheSize: number;

  if (typeof ttlMsOrOptions === "object" && ttlMsOrOptions !== null) {
    ttlMs = ttlMsOrOptions.ttlMs ?? DEFAULT_TTL_MS;
    maxCacheSize = ttlMsOrOptions.maxCacheSize ?? DEFAULT_MAX_CACHE_SIZE;
  } else {
    ttlMs = ttlMsOrOptions ?? DEFAULT_TTL_MS;
    maxCacheSize = DEFAULT_MAX_CACHE_SIZE;
  }

  const cache = new Map<string, CachedToken>();

  /**
   * Evict the least recently used entry from the cache.
   *
   * Because `Map` preserves insertion order and we re-insert entries on access
   * (moving them to the end), the *first* key is always the least recently
   * used entry.
   */
  function evictLRU(): void {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) {
      cache.delete(firstKey);
    }
  }

  /**
   * Touch an entry to mark it as recently used by re-inserting it at the end
   * of the Map's iteration order.
   */
  function touchEntry(key: string, entry: CachedToken): void {
    cache.delete(key);
    cache.set(key, entry);
  }

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

  /**
   * Verify a Firebase ID token, returning a cached result when available.
   *
   * @param token - The raw Firebase ID token (JWT).
   * @returns The decoded token payload.
   * @throws {Error} If the token is invalid or expired and not cached.
   */
  const verify: TokenVerifier = async (
    token: string
  ): Promise<DecodedIdToken> => {
    const now = Date.now();
    const cached = cache.get(token);

    // Return cached token if still valid, and touch it for LRU tracking
    if (cached && cached.expiresAt > now) {
      touchEntry(token, cached);
      return cached.decodedToken;
    }

    // Remove stale entry if present
    if (cached) {
      cache.delete(token);
    }

    // Verify with Firebase and cache the result
    const decodedToken = await verifyWithFirebase(token);

    // Evict LRU entry if cache is at capacity
    if (cache.size >= maxCacheSize) {
      evictLRU();
    }

    cache.set(token, {
      decodedToken,
      expiresAt: now + ttlMs,
    });

    return decodedToken;
  };

  return { verify, stop, cache };
}
