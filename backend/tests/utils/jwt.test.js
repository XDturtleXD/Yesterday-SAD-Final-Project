require("../helpers/testEnv");
const test = require("node:test");
const assert = require("node:assert/strict");

const jwtLib = require("jsonwebtoken");
const { signAccessToken, verifyAccessToken } = require("../../src/utils/jwt");

test("signAccessToken + verifyAccessToken round-trip", () => {
  const token = signAccessToken({ sub: "user-1", role: "concertmaster" });
  const decoded = verifyAccessToken(token);
  assert.equal(decoded.sub, "user-1");
  assert.equal(decoded.role, "concertmaster");
  assert.ok(typeof decoded.exp === "number");
});

test("verifyAccessToken throws AppError(401) on tampered token", () => {
  const token = signAccessToken({ sub: "user-1" });
  const tampered = token.slice(0, -2) + "xx";
  assert.throws(() => verifyAccessToken(tampered), (err) => {
    assert.equal(err.name, "AppError");
    assert.equal(err.statusCode, 401);
    return true;
  });
});

test("verifyAccessToken throws on token signed with a different secret", () => {
  const foreignToken = jwtLib.sign({ sub: "user-1" }, "some-other-secret");
  assert.throws(() => verifyAccessToken(foreignToken), (err) => {
    assert.equal(err.statusCode, 401);
    return true;
  });
});
