/**
 * @fileoverview User info retrieval from Firebase Auth.
 *
 * Provides a convenience wrapper around `firebase-admin/auth` to fetch a
 * user's profile and enrich it with the site-admin flag from
 * {@link isSiteAdmin}.
 */

import { getFirebaseAuth } from './FirebaseHelper';
import { isSiteAdmin } from './AdminHelper';
import type { UserInfoResponse } from '../types';

/**
 * Retrieve full user information from Firebase Auth by UID.
 *
 * Fetches the `UserRecord` from Firebase Admin, maps it to a
 * {@link UserInfoResponse} object, and attaches the `siteAdmin` flag.
 *
 * @param userId - The Firebase UID of the user to look up.
 * @returns A {@link UserInfoResponse} containing the user's profile data and
 *   admin status, or `null` if no user with the given UID exists.
 * @throws {Error} If Firebase Admin is not initialized or if any Firebase error
 *   other than `auth/user-not-found` occurs.
 *
 * @example
 * ```typescript
 * const userInfo = await getUserInfo(userId);
 * if (!userInfo) {
 *   return c.json({ error: 'User not found' }, 404);
 * }
 * return c.json({ data: userInfo });
 * ```
 */
export async function getUserInfo(
  userId: string
): Promise<UserInfoResponse | null> {
  try {
    const auth = getFirebaseAuth();
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
