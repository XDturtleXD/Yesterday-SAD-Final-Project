// HTTP-level tests for project invite creation + join-by-code flow.

require("../helpers/testEnv");
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFakeSupabase } = require("../helpers/fakeSupabase");
const { injectFakeSupabase, startHarness } = require("../helpers/httpHarness");
const {
  seedSections,
  seedUserWithToken,
  SECTION_FIRST_VIOLIN,
  SECTION_SECOND_VIOLIN,
} = require("../helpers/fixtures");

const fake = createFakeSupabase();
injectFakeSupabase(fake);
const app = require("../../src/app");
const harness = startHarness(app);

test.after(async () => {
  await harness.stop();
});

const seedOwnedProject = async () => {
  fake.reset({});
  seedSections(fake);
  const owner = seedUserWithToken(fake, { email: "cm@example.test", name: "CM" });
  const created = await harness.request("POST", "/api/projects", {
    token: owner.token,
    body: { name: "P", sectionId: SECTION_FIRST_VIOLIN },
  });
  return { owner, projectId: created.body.data.id };
};

test("POST /projects/:id/invite-code: concertmaster can mint a code", async () => {
  const { owner, projectId } = await seedOwnedProject();
  const { status, body } = await harness.request(
    "POST",
    `/api/projects/${projectId}/invite-code`,
    { token: owner.token, body: {} },
  );
  assert.equal(status, 200);
  assert.equal(typeof body.data.inviteCode, "string");
  assert.ok(body.data.inviteCode.length > 20, "invite code should be a JWT");
});

test("POST /projects/:id/invite-code: 403 for non-member", async () => {
  const { projectId } = await seedOwnedProject();
  const stranger = seedUserWithToken(fake, { email: "stranger@example.test" });
  const { status } = await harness.request(
    "POST",
    `/api/projects/${projectId}/invite-code`,
    { token: stranger.token, body: {} },
  );
  assert.equal(status, 403);
});

test("POST /projects/join-by-code: 400 when inviteCode missing", async () => {
  await seedOwnedProject();
  const joinUser = seedUserWithToken(fake, { email: "joiner@example.test" });
  const { status } = await harness.request("POST", "/api/projects/join-by-code", {
    token: joinUser.token,
    body: { sectionId: SECTION_SECOND_VIOLIN },
  });
  assert.equal(status, 400);
});

test("POST /projects/join-by-code: 400 on invalid code", async () => {
  await seedOwnedProject();
  const joinUser = seedUserWithToken(fake, { email: "joiner@example.test" });
  const { status } = await harness.request("POST", "/api/projects/join-by-code", {
    token: joinUser.token,
    body: { inviteCode: "not-a-jwt", sectionId: SECTION_SECOND_VIOLIN },
  });
  assert.equal(status, 400);
});

test("POST /projects/join-by-code: 201, new user becomes a `member`", async () => {
  const { owner, projectId } = await seedOwnedProject();
  const { body: codeBody } = await harness.request(
    "POST",
    `/api/projects/${projectId}/invite-code`,
    { token: owner.token, body: {} },
  );

  const joinUser = seedUserWithToken(fake, { email: "joiner@example.test" });
  const { status, body } = await harness.request(
    "POST",
    "/api/projects/join-by-code",
    {
      token: joinUser.token,
      body: { inviteCode: codeBody.data.inviteCode, sectionId: SECTION_SECOND_VIOLIN },
    },
  );
  assert.equal(status, 201);
  assert.equal(body.data.role, "member");
  assert.equal(body.data.section_id, SECTION_SECOND_VIOLIN);
  assert.equal(body.data.project_id, projectId);
});

test("POST /projects/join-by-code: 409 when user is already a member", async () => {
  const { owner, projectId } = await seedOwnedProject();
  const { body: codeBody } = await harness.request(
    "POST",
    `/api/projects/${projectId}/invite-code`,
    { token: owner.token, body: {} },
  );
  // Owner is already a member (auto-added as concertmaster on project create).
  const { status } = await harness.request("POST", "/api/projects/join-by-code", {
    token: owner.token,
    body: { inviteCode: codeBody.data.inviteCode, sectionId: SECTION_SECOND_VIOLIN },
  });
  assert.equal(status, 409);
});
