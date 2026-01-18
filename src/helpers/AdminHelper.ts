/**
 * @fileoverview Site admin checking utilities
 */

import { createAdminChecker } from '@sudobility/types';

type AdminChecker = (email: string | null | undefined) => boolean;

let siteAdminChecker: AdminChecker | null = null;

/**
 * Initialize the site admin checker with comma-separated email list.
 */
export function initializeSiteAdminChecker(
  emails: string | undefined | null
): void {
  siteAdminChecker = createAdminChecker(emails);
}

/**
 * Check if an email is a site admin.
 * Returns false if not initialized or email is null/undefined.
 */
export function isSiteAdmin(email: string | null | undefined): boolean {
  if (!siteAdminChecker) {
    return false;
  }
  return siteAdminChecker(email);
}

/**
 * Get the current admin checker (for testing).
 */
export function getSiteAdminChecker(): AdminChecker | null {
  return siteAdminChecker;
}

/**
 * Reset the admin checker (for testing).
 */
export function resetSiteAdminChecker(): void {
  siteAdminChecker = null;
}
