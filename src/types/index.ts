/**
 * @fileoverview Type definitions for auth_service
 */

import type { DecodedIdToken } from "firebase-admin/auth";

// Re-export shared types from @sudobility/types
export type { UserInfoResponse } from "@sudobility/types";

/** Firebase Admin SDK configuration */
export interface FirebaseAdminConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/** auth_service initialization options */
export interface AuthServiceConfig {
  firebase: FirebaseAdminConfig;
  /** Comma-separated list of site admin emails */
  siteAdminEmails?: string;
}

/** Verified user information from token */
export interface VerifiedUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
  siteAdmin: boolean;
  decodedToken: DecodedIdToken;
}

/** Token verifier function signature */
export type TokenVerifier = (token: string) => Promise<DecodedIdToken>;

/** Cached token entry */
export interface CachedToken {
  decodedToken: DecodedIdToken;
  expiresAt: number;
}
