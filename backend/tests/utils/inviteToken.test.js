require("../helpers/testEnv");
const test = require("node:test");
const assert = require("node:assert/strict");

const { signInviteToken, verifyInviteToken } = require("../../src/utils/inviteToken");

test("signInviteToken + verifyInviteToken round-trip preserves payload", () => {
  const code = signInviteToken({
    type: "project_invite",
    projectId: "11111111-1111-1111-1111-111111111111",
    createdBy: "22222222-2222-2222-2222-222222222222",
  });
  const payload = verifyInviteToken(code);
  assert.equal(payload.type, "project_invite");
  assert.equal(payload.projectId, "11111111-1111-1111-1111-111111111111");
});

test("verifyInviteToken throws AppError(400) on invalid code", () => {
  assert.throws(() => verifyInviteToken("not-a-jwt"), (err) => {
    assert.equal(err.name, "AppError");
    assert.equal(err.statusCode, 400);
    return true;
  });
});
