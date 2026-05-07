/**
 * @fileoverview Helper exports
 */

export {
  initializeFirebaseAdmin,
  getFirebaseAuth,
  verifyIdToken,
  isAnonymousUser,
} from "./FirebaseHelper";

export {
  createCachedVerifier,
  type CachedVerifier,
  type CachedVerifierOptions,
} from "./TokenCache";

export {
  initializeSiteAdminChecker,
  isSiteAdmin,
  getSiteAdminChecker,
  resetSiteAdminChecker,
} from "./AdminHelper";

export { getUserInfo } from "./UserInfoHelper";

export {
  deleteUserAccount,
  type AppleSignInConfig,
  type DeleteUserAccountOptions,
  type DeleteUserAccountResult,
} from "./AccountDeletionHelper";
