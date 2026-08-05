import { afterEach, describe, expect, it } from "vitest";
import { adminUsers, isAdminIdentity } from "@/lib/adminAccess";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("who reaches the admin panel", () => {
  it("nobody, when the list is not set", () => {
    // The panel reports every business. An unset setting must close it, not open it.
    delete process.env.ADMIN_USERS;
    expect(adminUsers()).toEqual([]);
    expect(isAdminIdentity({ username: "khunmyintaung", email: "k@x.com" })).toBe(false);
  });

  it("nobody, when the list is blank or only separators", () => {
    for (const value of ["", "   ", ",", " , , "]) {
      process.env.ADMIN_USERS = value;
      expect(adminUsers(), value).toEqual([]);
      expect(isAdminIdentity({ username: "anyone" }), value).toBe(false);
    }
  });

  it("matches on username or email, either case", () => {
    process.env.ADMIN_USERS = "KhunMyintAung, owner@example.com";
    expect(isAdminIdentity({ username: "khunmyintaung" })).toBe(true);
    expect(isAdminIdentity({ username: "someone", email: "OWNER@example.com" })).toBe(true);
  });

  it("turns away an account that is not named", () => {
    process.env.ADMIN_USERS = "khunmyintaung";
    // Any stranger who signs up with Google is an Owner of their own business, so being
    // an Owner cannot be what decides this.
    expect(isAdminIdentity({ username: "stranger", email: "stranger@gmail.com" })).toBe(false);
    expect(isAdminIdentity(null)).toBe(false);
    expect(isAdminIdentity({})).toBe(false);
  });

  it("does not treat a missing name as a match against a blank entry", () => {
    process.env.ADMIN_USERS = "khunmyintaung";
    expect(isAdminIdentity({ username: null, email: null })).toBe(false);
    expect(isAdminIdentity({ username: "", email: "" })).toBe(false);
  });
});
