import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { DecodedIdToken } from 'firebase-admin/auth';

// Mock firebase-admin modules
const mockVerifyIdToken = vi.fn();
const mockGetAuth = vi.fn(() => ({
  verifyIdToken: mockVerifyIdToken,
}));
const mockGetApps = vi.fn(() => []);
const mockInitializeApp = vi.fn(() => ({ name: 'test-app' }));
const mockCert = vi.fn(() => ({ type: 'service_account' }));

vi.mock('firebase-admin/app', () => ({
  initializeApp: (...args: unknown[]) => mockInitializeApp(...args),
  cert: (...args: unknown[]) => mockCert(...args),
  getApps: () => mockGetApps(),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: (...args: unknown[]) => mockGetAuth(...args),
}));

// We need to re-import with fresh module state for each describe block that
// tests initialization, because initializeFirebaseAdmin is idempotent.
describe('FirebaseHelper', () => {
  describe('initializeFirebaseAdmin', () => {
    beforeEach(() => {
      vi.resetModules();
      vi.clearAllMocks();
    });

    it('initializes Firebase Admin with provided config', async () => {
      const { initializeFirebaseAdmin } = await import(
        '../src/helpers/FirebaseHelper'
      );

      initializeFirebaseAdmin({
        projectId: 'test-project',
        clientEmail: 'test@test.iam.gserviceaccount.com',
        privateKey: 'fake-key',
      });

      expect(mockCert).toHaveBeenCalledWith({
        projectId: 'test-project',
        clientEmail: 'test@test.iam.gserviceaccount.com',
        privateKey: 'fake-key',
      });
      expect(mockGetAuth).toHaveBeenCalled();
    });

    it('replaces escaped newlines in private key', async () => {
      const { initializeFirebaseAdmin } = await import(
        '../src/helpers/FirebaseHelper'
      );

      initializeFirebaseAdmin({
        projectId: 'test-project',
        clientEmail: 'test@test.iam.gserviceaccount.com',
        privateKey: 'line1\\nline2',
      });

      // The cert call should receive the key with real newlines
      expect(mockCert).toHaveBeenCalledWith(
        expect.objectContaining({
          privateKey: 'line1\nline2',
        })
      );
    });

    it('reuses existing Firebase app when one already exists', async () => {
      const existingApp = { name: 'existing-app' };
      mockGetApps.mockReturnValueOnce([existingApp]);

      const { initializeFirebaseAdmin } = await import(
        '../src/helpers/FirebaseHelper'
      );

      initializeFirebaseAdmin({
        projectId: 'test-project',
        clientEmail: 'test@test.iam.gserviceaccount.com',
        privateKey: 'fake-key',
      });

      // Should NOT call initializeApp since an app already exists
      expect(mockInitializeApp).not.toHaveBeenCalled();
      expect(mockGetAuth).toHaveBeenCalledWith(existingApp);
    });

    it('is idempotent -- second call is a no-op', async () => {
      const { initializeFirebaseAdmin } = await import(
        '../src/helpers/FirebaseHelper'
      );

      initializeFirebaseAdmin({
        projectId: 'test-project',
        clientEmail: 'test@test.iam.gserviceaccount.com',
        privateKey: 'key-1',
      });

      initializeFirebaseAdmin({
        projectId: 'other-project',
        clientEmail: 'other@other.iam.gserviceaccount.com',
        privateKey: 'key-2',
      });

      // cert should only be called once (first initialization)
      expect(mockCert).toHaveBeenCalledTimes(1);
    });
  });

  describe('getFirebaseAuth', () => {
    beforeEach(() => {
      vi.resetModules();
      vi.clearAllMocks();
    });

    it('returns the auth instance after initialization', async () => {
      const { initializeFirebaseAdmin, getFirebaseAuth } = await import(
        '../src/helpers/FirebaseHelper'
      );

      initializeFirebaseAdmin({
        projectId: 'test-project',
        clientEmail: 'test@test.iam.gserviceaccount.com',
        privateKey: 'fake-key',
      });

      const auth = getFirebaseAuth();
      expect(auth).toBeDefined();
    });

    it('throws if not initialized', async () => {
      const { getFirebaseAuth } = await import(
        '../src/helpers/FirebaseHelper'
      );

      expect(() => getFirebaseAuth()).toThrow(
        'Firebase Admin not initialized. Call initializeAuth() first.'
      );
    });
  });

  describe('verifyIdToken', () => {
    beforeEach(() => {
      vi.resetModules();
      vi.clearAllMocks();
    });

    it('delegates to Firebase Auth verifyIdToken', async () => {
      const { initializeFirebaseAdmin, verifyIdToken } = await import(
        '../src/helpers/FirebaseHelper'
      );

      initializeFirebaseAdmin({
        projectId: 'test-project',
        clientEmail: 'test@test.iam.gserviceaccount.com',
        privateKey: 'fake-key',
      });

      const decoded: DecodedIdToken = {
        uid: 'user-123',
        email: 'user@example.com',
        aud: 'test-project',
        auth_time: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        iss: 'https://securetoken.google.com/test-project',
        sub: 'user-123',
        firebase: { identities: {}, sign_in_provider: 'password' },
      } as DecodedIdToken;

      mockVerifyIdToken.mockResolvedValueOnce(decoded);

      const result = await verifyIdToken('some-jwt-token');
      expect(result).toEqual(decoded);
      expect(mockVerifyIdToken).toHaveBeenCalledWith('some-jwt-token');
    });

    it('propagates errors from Firebase', async () => {
      const { initializeFirebaseAdmin, verifyIdToken } = await import(
        '../src/helpers/FirebaseHelper'
      );

      initializeFirebaseAdmin({
        projectId: 'test-project',
        clientEmail: 'test@test.iam.gserviceaccount.com',
        privateKey: 'fake-key',
      });

      mockVerifyIdToken.mockRejectedValueOnce(new Error('Token expired'));

      await expect(verifyIdToken('bad-token')).rejects.toThrow(
        'Token expired'
      );
    });
  });

  describe('isAnonymousUser', () => {
    // isAnonymousUser is a pure function -- no module state to reset
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('returns true for anonymous sign-in provider', async () => {
      const { isAnonymousUser } = await import(
        '../src/helpers/FirebaseHelper'
      );

      const token = {
        uid: 'anon-123',
        firebase: { sign_in_provider: 'anonymous', identities: {} },
      } as DecodedIdToken;

      expect(isAnonymousUser(token)).toBe(true);
    });

    it('returns false for password sign-in provider', async () => {
      const { isAnonymousUser } = await import(
        '../src/helpers/FirebaseHelper'
      );

      const token = {
        uid: 'user-123',
        firebase: { sign_in_provider: 'password', identities: {} },
      } as DecodedIdToken;

      expect(isAnonymousUser(token)).toBe(false);
    });

    it('returns false for google sign-in provider', async () => {
      const { isAnonymousUser } = await import(
        '../src/helpers/FirebaseHelper'
      );

      const token = {
        uid: 'user-456',
        firebase: { sign_in_provider: 'google.com', identities: {} },
      } as DecodedIdToken;

      expect(isAnonymousUser(token)).toBe(false);
    });
  });
});
