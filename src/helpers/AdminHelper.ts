/**
 * @fileoverview Site admin checking utilities.
 *
 * Provides functions to initialize and query a whitelist of site administrator
 * email addresses. The whitelist is backed by `createAdminChecker` from
 * `@sudobility/types` which performs case-insensitive matching.
 *
 * Must be initialized via {@link initializeSiteAdminChecker} (or the top-level
 * `initializeAuth`) before {@link isSiteAdmin} will return `true` for any email.
 */

import { createAdminChecker } from '@sudobility/types';

type AdminChecker = (email: string | null | undefined) => boolean;

let siteAdminChecker: AdminChecker | null = null;

/**
 * Initialize the site admin checker with a comma-separated list of admin emails.
 *
 * Typically called indirectly via `initializeAuth()`. After initialization,
 * {@link isSiteAdmin} will recognize the supplied emails (case-insensitive).
 *
 * @param emails - Comma-separated email addresses, or `null`/`undefined` to
 *   create a checker that always returns `false`.
 *
 * @example
 * ```typescript
 * initializeSiteAdminChecker('admin@example.com,ops@example.com');
 * isSiteAdmin('admin@example.com'); // true
 * ```
 */
export function initializeSiteAdminChecker(
  emails: string | undefined | null
): void {
  siteAdminChecker = createAdminChecker(emails);
}

/**
 * Check whether the given email belongs to a site administrator.
 *
 * Returns `false` if the checker has not been initialized or if the email is
 * `null` / `undefined`.
 *
 * @param email - The email address to check (case-insensitive).
 * @returns `true` if the email is in the admin whitelist, `false` otherwise.
 *
 * @example
 * ```typescript
 * if (isSiteAdmin(userRecord.email)) {
 *   // grant admin privileges
 * }
 * ```
 */
export function isSiteAdmin(email: string | null | undefined): boolean {
  if (!siteAdminChecker) {
    return false;
  }
  return siteAdminChecker(email);
}

/**
 * Get the current admin checker function.
 *
 * Primarily exposed for testing purposes.
 *
 * @returns The current {@link AdminChecker} function, or `null` if not initialized.
 */
export function getSiteAdminChecker(): AdminChecker | null {
  return siteAdminChecker;
}

/**
 * Reset the admin checker to its uninitialized state.
 *
 * Intended for use in test teardown so that tests do not leak state.
 */
export function resetSiteAdminChecker(): void {
  siteAdminChecker = null;
}
