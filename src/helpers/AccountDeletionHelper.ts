/**
 * @fileoverview Account deletion helper for Firebase users.
 *
 * Provides functions to fully delete a user account including:
 * - Revoking Google OAuth tokens
 * - Revoking Apple Sign In tokens
 * - Revoking Firebase refresh tokens
 * - Deleting the Firebase user record
 */

import { getFirebaseAuth } from "./FirebaseHelper";

/** Configuration for Apple Sign In token revocation */
export interface AppleSignInConfig {
  /** The Services ID (e.g., com.example.app) */
  clientId: string;
  /** The Apple Developer Team ID */
  teamId: string;
  /** The Key ID for the Sign in with Apple key */
  keyId: string;
  /** The .p8 private key content (PEM format) */
  privateKey: string;
}

/** Options for deleting a user account */
export interface DeleteUserAccountOptions {
  /** Google OAuth access token for revocation */
  googleAccessToken?: string;
  /** Apple authorization code for token exchange and revocation */
  appleAuthorizationCode?: string;
  /** Apple Sign In configuration (required for Apple token revocation) */
  appleConfig?: AppleSignInConfig;
}

/** Result of an account deletion operation */
export interface DeleteUserAccountResult {
  /** Whether the Firebase user was deleted */
  userDeleted: boolean;
  /** Whether Google token was revoked (null if not attempted) */
  googleTokenRevoked: boolean | null;
  /** Whether Apple token was revoked (null if not attempted) */
  appleTokenRevoked: boolean | null;
}

/**
 * Generate an Apple client secret JWT for Sign in with Apple.
 *
 * Apple requires a client_secret that is a JWT signed with your private key
 * using the ES256 algorithm.
 *
 * @param config - Apple Sign In configuration
 * @returns A signed JWT string to use as client_secret
 */
async function generateAppleClientSecret(
  config: AppleSignInConfig
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: config.keyId };
  const claims = {
    iss: config.teamId,
    iat: now,
    exp: now + 15777000, // ~6 months
    aud: "https://appleid.apple.com",
    sub: config.clientId,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedClaims = base64url(JSON.stringify(claims));
  const signingInput = `${encodedHeader}.${encodedClaims}`;

  // Import the PEM private key for ES256 signing
  const keyData = pemToArrayBuffer(config.privateKey);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const signature = base64url(signatureBuffer);
  return `${signingInput}.${signature}`;
}

/**
 * Revoke a Google OAuth access token.
 *
 * @param accessToken - The Google OAuth access token to revoke
 * @returns true if revocation succeeded, false otherwise
 */
async function revokeGoogleToken(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );
    return response.ok;
  } catch (error) {
    console.error("[AccountDeletion] Failed to revoke Google token:", error);
    return false;
  }
}

/**
 * Revoke an Apple Sign In token.
 *
 * Exchanges the authorization code for a refresh token, then revokes it.
 *
 * @param authorizationCode - The Apple authorization code from re-authentication
 * @param config - Apple Sign In configuration
 * @returns true if revocation succeeded, false otherwise
 */
async function revokeAppleToken(
  authorizationCode: string,
  config: AppleSignInConfig
): Promise<boolean> {
  try {
    const clientSecret = await generateAppleClientSecret(config);

    // Exchange authorization code for tokens
    const tokenResponse = await fetch("https://appleid.apple.com/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: clientSecret,
        code: authorizationCode,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenResponse.ok) {
      console.error(
        "[AccountDeletion] Failed to exchange Apple authorization code:",
        await tokenResponse.text()
      );
      return false;
    }

    const tokenData = (await tokenResponse.json()) as {
      refresh_token?: string;
    };
    const refreshToken = tokenData.refresh_token;

    if (!refreshToken) {
      console.error(
        "[AccountDeletion] No refresh token in Apple token response"
      );
      return false;
    }

    // Revoke the refresh token
    const revokeResponse = await fetch(
      "https://appleid.apple.com/auth/revoke",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: clientSecret,
          token: refreshToken,
          token_type_hint: "refresh_token",
        }).toString(),
      }
    );

    return revokeResponse.ok;
  } catch (error) {
    console.error("[AccountDeletion] Failed to revoke Apple token:", error);
    return false;
  }
}

/**
 * Delete a Firebase user account with full OAuth token revocation.
 *
 * This function:
 * 1. Revokes Google OAuth token if provided
 * 2. Revokes Apple Sign In token if provided (requires Apple config)
 * 3. Revokes all Firebase refresh tokens
 * 4. Deletes the Firebase user record
 *
 * @param userId - The Firebase UID of the user to delete
 * @param options - Optional tokens and configuration for OAuth revocation
 * @returns Result indicating which operations succeeded
 * @throws {Error} If Firebase Admin is not initialized or user deletion fails
 *
 * @example
 * ```typescript
 * const result = await deleteUserAccount(userId, {
 *   googleAccessToken: 'ya29...',
 *   appleAuthorizationCode: 'c1234...',
 *   appleConfig: {
 *     clientId: 'com.example.app',
 *     teamId: 'TEAM123',
 *     keyId: 'KEY123',
 *     privateKey: '-----BEGIN PRIVATE KEY-----\n...',
 *   },
 * });
 * ```
 */
export async function deleteUserAccount(
  userId: string,
  options?: DeleteUserAccountOptions
): Promise<DeleteUserAccountResult> {
  const auth = getFirebaseAuth();
  const result: DeleteUserAccountResult = {
    userDeleted: false,
    googleTokenRevoked: null,
    appleTokenRevoked: null,
  };

  // Revoke Google token if provided
  if (options?.googleAccessToken) {
    result.googleTokenRevoked = await revokeGoogleToken(
      options.googleAccessToken
    );
  }

  // Revoke Apple token if provided with config
  if (options?.appleAuthorizationCode && options?.appleConfig) {
    result.appleTokenRevoked = await revokeAppleToken(
      options.appleAuthorizationCode,
      options.appleConfig
    );
  }

  // Revoke all Firebase refresh tokens
  await auth.revokeRefreshTokens(userId);

  // Delete the Firebase user
  await auth.deleteUser(userId);
  result.userDeleted = true;

  return result;
}

// --- Utility functions ---

/** Base64url encode a string or ArrayBuffer */
function base64url(input: string | ArrayBuffer): string {
  let base64: string;
  if (typeof input === "string") {
    base64 = Buffer.from(input).toString("base64");
  } else {
    base64 = Buffer.from(new Uint8Array(input)).toString("base64");
  }
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Convert PEM-encoded key to ArrayBuffer */
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const pemContents = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s/g, "");
  const binary = Buffer.from(pemContents, "base64");
  return binary.buffer.slice(
    binary.byteOffset,
    binary.byteOffset + binary.byteLength
  );
}
