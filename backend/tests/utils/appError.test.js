require("../helpers/testEnv");
const test = require("node:test");
const assert = require("node:assert/strict");

const AppError = require("../../src/utils/appError");

test("AppError defaults to status 500 and null details", () => {
  const err = new AppError("boom");
  assert.equal(err.name, "AppError");
  assert.equal(err.message, "boom");
  assert.equal(err.statusCode, 500);
  assert.equal(err.details, null);
  assert.ok(err instanceof Error);
});

test("AppError preserves status and details", () => {
  const cause = { code: "23505" };
  const err = new AppError("conflict", 409, cause);
  assert.equal(err.statusCode, 409);
  assert.equal(err.details, cause);
});
