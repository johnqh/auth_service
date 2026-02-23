import { describe, expect, it, afterEach, vi, beforeEach } from 'vitest';
import type { DecodedIdToken } from 'firebase-admin/auth';

// Mock FirebaseHelper so we never hit a real Firebase backend
vi.mock('../src/helpers/FirebaseHelper', () => ({
  verifyIdToken: vi.fn(),
}));

import { createCachedVerifier } from '../src/helpers/TokenCache';
import { verifyIdToken } from '../src/helpers/FirebaseHelper';

const mockedVerify = vi.mocked(verifyIdToken);

function makeToken(uid: string): DecodedIdToken {
  return {
    uid,
    email: `${uid}@example.com`,
    aud: 'test-project',
    auth_time: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    iss: `https://securetoken.google.com/test-project`,
    sub: uid,
    firebase: {
      identities: {},
      sign_in_provider: 'password',
    },
  } as DecodedIdToken;
}

describe('TokenCache', () => {
  let stop: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Always stop the cleanup interval to prevent dangling timers
    stop?.();
  });

  describe('basic caching (set/get)', () => {
    it('caches a verified token and returns it on subsequent calls', async () => {
      const decoded = makeToken('user1');
      mockedVerify.mockResolvedValueOnce(decoded);

      const verifier = createCachedVerifier(60000);
      stop = verifier.stop;

      // First call should hit Firebase
      const result1 = await verifier.verify('token-abc');
      expect(result1).toEqual(decoded);
      expect(mockedVerify).toHaveBeenCalledTimes(1);

      // Second call should return cached value
      const result2 = await verifier.verify('token-abc');
      expect(result2).toEqual(decoded);
      expect(mockedVerify).toHaveBeenCalledTimes(1); // still 1
    });

    it('verifies different tokens independently', async () => {
      const decoded1 = makeToken('user1');
      const decoded2 = makeToken('user2');
      mockedVerify.mockResolvedValueOnce(decoded1).mockResolvedValueOnce(decoded2);

      const verifier = createCachedVerifier(60000);
      stop = verifier.stop;

      await verifier.verify('token-1');
      await verifier.verify('token-2');

      expect(mockedVerify).toHaveBeenCalledTimes(2);
      expect(verifier.cache.size).toBe(2);
    });
  });

  describe('TTL expiration', () => {
    it('returns cached value before TTL expires', async () => {
      vi.useFakeTimers();
      const decoded = makeToken('user1');
      mockedVerify.mockResolvedValue(decoded);

      const verifier = createCachedVerifier(1000); // 1 second TTL
      stop = verifier.stop;

      await verifier.verify('token-ttl');
      expect(mockedVerify).toHaveBeenCalledTimes(1);

      // Advance time but stay within TTL
      vi.advanceTimersByTime(500);
      await verifier.verify('token-ttl');
      expect(mockedVerify).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('re-verifies token after TTL expires', async () => {
      vi.useFakeTimers();
      const decoded = makeToken('user1');
      mockedVerify.mockResolvedValue(decoded);

      const verifier = createCachedVerifier(1000); // 1 second TTL
      stop = verifier.stop;

      await verifier.verify('token-ttl');
      expect(mockedVerify).toHaveBeenCalledTimes(1);

      // Advance time past TTL
      vi.advanceTimersByTime(1500);
      await verifier.verify('token-ttl');
      expect(mockedVerify).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });
  });

  describe('LRU eviction', () => {
    it('evicts the least recently used entry when cache exceeds maxCacheSize', async () => {
      const tokens = ['tok-a', 'tok-b', 'tok-c', 'tok-d'];
      for (const tok of tokens) {
        mockedVerify.mockResolvedValueOnce(makeToken(tok));
      }

      const verifier = createCachedVerifier({ ttlMs: 60000, maxCacheSize: 3 });
      stop = verifier.stop;

      // Fill cache to capacity (3)
      await verifier.verify('tok-a');
      await verifier.verify('tok-b');
      await verifier.verify('tok-c');
      expect(verifier.cache.size).toBe(3);

      // Adding a 4th should evict the oldest (tok-a)
      await verifier.verify('tok-d');
      expect(verifier.cache.size).toBe(3);
      expect(verifier.cache.has('tok-a')).toBe(false);
      expect(verifier.cache.has('tok-b')).toBe(true);
      expect(verifier.cache.has('tok-c')).toBe(true);
      expect(verifier.cache.has('tok-d')).toBe(true);
    });

    it('touching a cached entry prevents it from being evicted', async () => {
      const tokens = ['tok-a', 'tok-b', 'tok-c', 'tok-d'];
      for (const tok of tokens) {
        mockedVerify.mockResolvedValueOnce(makeToken(tok));
      }

      const verifier = createCachedVerifier({ ttlMs: 60000, maxCacheSize: 3 });
      stop = verifier.stop;

      await verifier.verify('tok-a');
      await verifier.verify('tok-b');
      await verifier.verify('tok-c');

      // Access tok-a to move it to the end (most recently used)
      await verifier.verify('tok-a'); // cache hit, no new Firebase call
      expect(mockedVerify).toHaveBeenCalledTimes(3);

      // Now tok-b is the oldest. Adding tok-d should evict tok-b.
      await verifier.verify('tok-d');
      expect(verifier.cache.size).toBe(3);
      expect(verifier.cache.has('tok-a')).toBe(true); // was touched
      expect(verifier.cache.has('tok-b')).toBe(false); // evicted
      expect(verifier.cache.has('tok-c')).toBe(true);
      expect(verifier.cache.has('tok-d')).toBe(true);
    });

    it('maxCacheSize of 1 always keeps only the latest entry', async () => {
      mockedVerify
        .mockResolvedValueOnce(makeToken('u1'))
        .mockResolvedValueOnce(makeToken('u2'));

      const verifier = createCachedVerifier({ ttlMs: 60000, maxCacheSize: 1 });
      stop = verifier.stop;

      await verifier.verify('tok-1');
      expect(verifier.cache.size).toBe(1);

      await verifier.verify('tok-2');
      expect(verifier.cache.size).toBe(1);
      expect(verifier.cache.has('tok-1')).toBe(false);
      expect(verifier.cache.has('tok-2')).toBe(true);
    });
  });

  describe('cleanup interval', () => {
    it('removes expired entries during periodic cleanup', async () => {
      vi.useFakeTimers();
      mockedVerify.mockResolvedValue(makeToken('user1'));

      const verifier = createCachedVerifier(500); // 500ms TTL
      stop = verifier.stop;

      await verifier.verify('tok-cleanup');
      expect(verifier.cache.size).toBe(1);

      // Advance past TTL and past the cleanup interval (60s)
      vi.advanceTimersByTime(61000);
      expect(verifier.cache.size).toBe(0);

      vi.useRealTimers();
    });

    it('stop() prevents further cleanup cycles', async () => {
      vi.useFakeTimers();
      mockedVerify.mockResolvedValue(makeToken('user1'));

      const verifier = createCachedVerifier(500);
      stop = verifier.stop;

      await verifier.verify('tok-stop');
      expect(verifier.cache.size).toBe(1);

      // Stop the interval
      verifier.stop();

      // Even after a long time, the cache entry persists (expired but not cleaned)
      vi.advanceTimersByTime(120000);
      expect(verifier.cache.size).toBe(1);

      vi.useRealTimers();
    });
  });

  describe('cache invalidation', () => {
    it('can be manually cleared via cache.clear()', async () => {
      mockedVerify.mockResolvedValue(makeToken('user1'));

      const verifier = createCachedVerifier(60000);
      stop = verifier.stop;

      await verifier.verify('tok-clear');
      expect(verifier.cache.size).toBe(1);

      verifier.cache.clear();
      expect(verifier.cache.size).toBe(0);

      // Next verify should call Firebase again
      await verifier.verify('tok-clear');
      expect(mockedVerify).toHaveBeenCalledTimes(2);
    });

    it('can delete specific entries via cache.delete()', async () => {
      mockedVerify.mockResolvedValue(makeToken('user1'));

      const verifier = createCachedVerifier(60000);
      stop = verifier.stop;

      await verifier.verify('tok-del');
      expect(verifier.cache.has('tok-del')).toBe(true);

      verifier.cache.delete('tok-del');
      expect(verifier.cache.has('tok-del')).toBe(false);

      // Re-verify should call Firebase
      await verifier.verify('tok-del');
      expect(mockedVerify).toHaveBeenCalledTimes(2);
    });
  });

  describe('backward compatibility', () => {
    it('accepts a numeric ttlMs argument (original API)', async () => {
      mockedVerify.mockResolvedValue(makeToken('user1'));

      const verifier = createCachedVerifier(30000);
      stop = verifier.stop;

      await verifier.verify('tok-compat');
      expect(verifier.cache.size).toBe(1);
    });

    it('works with no arguments (uses defaults)', async () => {
      mockedVerify.mockResolvedValue(makeToken('user1'));

      const verifier = createCachedVerifier();
      stop = verifier.stop;

      await verifier.verify('tok-default');
      expect(verifier.cache.size).toBe(1);
    });
  });
});
