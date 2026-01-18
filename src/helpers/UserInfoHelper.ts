/**
 * @fileoverview User info retrieval from Firebase
 */

import { getFirebaseAuth } from './FirebaseHelper';
import { isSiteAdmin } from './AdminHelper';
import type { UserInfoResponse } from '../types';

/**
 * Get full user info from Firebase Admin SDK.
 *
 * @param userId - Firebase UID
 * @returns User info with siteAdmin flag, or null if user not found
 *
 * @example
 * ```typescript
 * const userInfo = await getUserInfo(userId);
 * if (!userInfo) {
 *   return c.json(errorResponse('User not found'), 403);
 * }
 * return c.json(successResponse(userInfo));
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
