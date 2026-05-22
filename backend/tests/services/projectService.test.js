require("../helpers/testEnv");
const test = require("node:test");
const assert = require("node:assert/strict");

const { isPlatformAdmin } = require("../../src/services/projectService");

test("isPlatformAdmin: true when system_role is platform_admin", () => {
  assert.equal(isPlatformAdmin({ id: "u1", system_role: "platform_admin" }), true);
});

test("isPlatformAdmin: true when legacy `role` field is platform_admin", () => {
  // Some upstream code paths use `role` instead of `system_role`; both must work.
  assert.equal(isPlatformAdmin({ id: "u1", role: "platform_admin" }), true);
});

test("isPlatformAdmin: false for regular user", () => {
  assert.equal(isPlatformAdmin({ id: "u1", system_role: "user" }), false);
});

test("isPlatformAdmin: falsy for null/undefined user", () => {
  // Implementation uses `user && ...` so returns null/undefined for missing user;
  // we only care that it's falsy in boolean context, which is how callers use it.
  assert.ok(!isPlatformAdmin(null));
  assert.ok(!isPlatformAdmin(undefined));
});
