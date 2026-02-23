import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock FirebaseHelper
const mockGetUser = vi.fn();
vi.mock('../src/helpers/FirebaseHelper', () => ({
  getFirebaseAuth: vi.fn(() => ({
    getUser: mockGetUser,
  })),
}));

// Mock AdminHelper
vi.mock('../src/helpers/AdminHelper', () => ({
  isSiteAdmin: vi.fn((email: string | null | undefined) => {
    return email === 'admin@example.com';
  }),
}));

import { getUserInfo } from '../src/helpers/UserInfoHelper';

function makeUserRecord(overrides: Record<string, unknown> = {}) {
  return {
    uid: 'user-123',
    email: 'user@example.com',
    displayName: 'Test User',
    emailVerified: true,
    photoURL: 'https://example.com/photo.jpg',
    phoneNumber: '+1234567890',
    disabled: false,
    metadata: {
      creationTime: '2024-01-01T00:00:00Z',
      lastSignInTime: '2024-06-01T00:00:00Z',
    },
    ...overrides,
  };
}

describe('UserInfoHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserInfo', () => {
    it('retrieves user info and maps it correctly', async () => {
      const userRecord = makeUserRecord();
      mockGetUser.mockResolvedValueOnce(userRecord);

      const result = await getUserInfo('user-123');

      expect(result).toEqual({
        uid: 'user-123',
        email: 'user@example.com',
        displayName: 'Test User',
        emailVerified: true,
        siteAdmin: false,
        photoURL: 'https://example.com/photo.jpg',
        phoneNumber: '+1234567890',
        disabled: false,
        metadata: {
          creationTime: '2024-01-01T00:00:00Z',
          lastSignInTime: '2024-06-01T00:00:00Z',
        },
      });
      expect(mockGetUser).toHaveBeenCalledWith('user-123');
    });

    it('marks user as siteAdmin when email matches', async () => {
      const userRecord = makeUserRecord({ email: 'admin@example.com' });
      mockGetUser.mockResolvedValueOnce(userRecord);

      const result = await getUserInfo('admin-uid');

      expect(result).not.toBeNull();
      expect(result!.siteAdmin).toBe(true);
    });

    it('returns siteAdmin false for non-admin users', async () => {
      const userRecord = makeUserRecord({ email: 'regular@example.com' });
      mockGetUser.mockResolvedValueOnce(userRecord);

      const result = await getUserInfo('user-uid');

      expect(result).not.toBeNull();
      expect(result!.siteAdmin).toBe(false);
    });

    it('returns null for user not found', async () => {
      const error = new Error('User not found');
      (error as Error & { code: string }).code = 'auth/user-not-found';
      mockGetUser.mockRejectedValueOnce(error);

      const result = await getUserInfo('nonexistent-uid');

      expect(result).toBeNull();
    });

    it('throws for other Firebase errors', async () => {
      const error = new Error('Internal error');
      (error as Error & { code: string }).code = 'auth/internal-error';
      mockGetUser.mockRejectedValueOnce(error);

      await expect(getUserInfo('some-uid')).rejects.toThrow('Internal error');
    });

    it('handles missing optional fields with null defaults', async () => {
      const userRecord = makeUserRecord({
        email: undefined,
        displayName: undefined,
        photoURL: undefined,
        phoneNumber: undefined,
        metadata: {
          creationTime: undefined,
          lastSignInTime: undefined,
        },
      });
      mockGetUser.mockResolvedValueOnce(userRecord);

      const result = await getUserInfo('user-no-optional');

      expect(result).not.toBeNull();
      expect(result!.email).toBeNull();
      expect(result!.displayName).toBeNull();
      expect(result!.photoURL).toBeNull();
      expect(result!.phoneNumber).toBeNull();
      expect(result!.metadata.creationTime).toBeNull();
      expect(result!.metadata.lastSignInTime).toBeNull();
    });

    it('handles disabled users', async () => {
      const userRecord = makeUserRecord({ disabled: true });
      mockGetUser.mockResolvedValueOnce(userRecord);

      const result = await getUserInfo('disabled-uid');

      expect(result).not.toBeNull();
      expect(result!.disabled).toBe(true);
    });
  });
});
