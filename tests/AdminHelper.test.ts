import { describe, expect, it, beforeEach } from "vitest";
import {
  initializeSiteAdminChecker,
  isSiteAdmin,
  resetSiteAdminChecker,
} from "../src/helpers/AdminHelper";

describe("AdminHelper", () => {
  beforeEach(() => {
    resetSiteAdminChecker();
  });

  describe("isSiteAdmin", () => {
    it("returns false when not initialized", () => {
      expect(isSiteAdmin("admin@example.com")).toBe(false);
    });

    it("returns true for admin email after initialization", () => {
      initializeSiteAdminChecker("admin@example.com,other@example.com");
      expect(isSiteAdmin("admin@example.com")).toBe(true);
      expect(isSiteAdmin("other@example.com")).toBe(true);
    });

    it("returns false for non-admin email", () => {
      initializeSiteAdminChecker("admin@example.com");
      expect(isSiteAdmin("user@example.com")).toBe(false);
    });

    it("handles case-insensitive matching", () => {
      initializeSiteAdminChecker("admin@example.com");
      expect(isSiteAdmin("ADMIN@Example.COM")).toBe(true);
    });

    it("returns false for null email", () => {
      initializeSiteAdminChecker("admin@example.com");
      expect(isSiteAdmin(null)).toBe(false);
    });

    it("returns false for undefined email", () => {
      initializeSiteAdminChecker("admin@example.com");
      expect(isSiteAdmin(undefined)).toBe(false);
    });

    it("handles empty admin list", () => {
      initializeSiteAdminChecker("");
      expect(isSiteAdmin("admin@example.com")).toBe(false);
    });

    it("handles null admin list", () => {
      initializeSiteAdminChecker(null);
      expect(isSiteAdmin("admin@example.com")).toBe(false);
    });
  });
});
