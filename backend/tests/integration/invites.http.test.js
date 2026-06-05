// HTTP-level tests for project invite creation + join-by-code flow.

require("../helpers/testEnv");
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFakeSupabase } = require("../helpers/fakeSupabase");
const { injectFakeSupabase, startHarness } = require("../helpers/httpHarness");
const { signInviteToken } = require("../../src/utils/inviteToken");
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

const now = () => new Date().toISOString();

const inviteBody = (overrides = {}) => ({
  targetRole: "member",
  sectionId: SECTION_FIRST_VIOLIN,
  ...overrides,
});

const annotationBody = (overrides = {}) => ({
  scope: "shared",
  annotationType: "dynamic",
  targetRef: {
    partId: "P1",
    measureNumber: 1,
    noteIndex: 0,
  },
  payload: {
    mark: "ff",
  },
  ...overrides,
});

const seedMember = (projectId, user, sectionId, role = "member") => {
  fake.seedRows("project_members", [
    {
      id: `pm-${user.user.id}-${role}`,
      project_id: projectId,
      user_id: user.user.id,
      section_id: sectionId,
      role,
      created_at: now(),
      updated_at: now(),
    },
  ]);
};

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

const createInvite = async (token, projectId, body) =>
  harness.request("POST", `/api/projects/${projectId}/invite-code`, {
    token,
    body,
  });

const joinInvite = async (token, inviteCode, extraBody = {}) =>
  harness.request("POST", "/api/projects/join-by-code", {
    token,
    body: { inviteCode, ...extraBody },
  });

const seedDbInvite = ({ projectId, owner, tokenId, targetRole = "member", sectionId, expiresAt, revokedAt = null }) => {
  fake.seedRows("project_invites", [
    {
      id: `invite-${tokenId}`,
      project_id: projectId,
      target_section_id: sectionId,
      target_role: targetRole,
      token_id: tokenId,
      created_by: owner.user.id,
      expires_at: expiresAt,
      used_by: null,
      used_at: null,
      revoked_at: revokedAt,
      created_at: now(),
      updated_at: now(),
    },
  ]);

  return signInviteToken({
    type: "project_invite",
    projectId,
    tokenId,
    createdBy: owner.user.id,
  });
};

test("concertmaster invites a principal to a specified section", async () => {
  const { owner, projectId } = await seedOwnedProject();
  const invite = await createInvite(owner.token, projectId, inviteBody({
    targetRole: "principal",
    sectionId: SECTION_SECOND_VIOLIN,
  }));
  assert.equal(invite.status, 200);
  assert.equal(invite.body.data.targetRole, "principal");
  assert.equal(invite.body.data.sectionId, SECTION_SECOND_VIOLIN);

  const joinUser = seedUserWithToken(fake, { email: "principal@example.test" });
  const joined = await joinInvite(joinUser.token, invite.body.data.inviteCode);

  assert.equal(joined.status, 201);
  assert.equal(joined.body.data.role, "principal");
  assert.equal(joined.body.data.section_id, SECTION_SECOND_VIOLIN);
  assert.equal(joined.body.data.project_id, projectId);
});

test("principal invites a member to their own section", async () => {
  const { projectId } = await seedOwnedProject();
  const principal = seedUserWithToken(fake, { email: "principal@example.test" });
  seedMember(projectId, principal, SECTION_SECOND_VIOLIN, "principal");

  const invite = await createInvite(principal.token, projectId, inviteBody({
    targetRole: "member",
    sectionId: SECTION_SECOND_VIOLIN,
  }));
  assert.equal(invite.status, 200);

  const member = seedUserWithToken(fake, { email: "member@example.test" });
  const joined = await joinInvite(member.token, invite.body.data.inviteCode);

  assert.equal(joined.status, 201);
  assert.equal(joined.body.data.role, "member");
  assert.equal(joined.body.data.section_id, SECTION_SECOND_VIOLIN);
});

test("principal cannot invite another principal", async () => {
  const { projectId } = await seedOwnedProject();
  const principal = seedUserWithToken(fake, { email: "principal@example.test" });
  seedMember(projectId, principal, SECTION_FIRST_VIOLIN, "principal");

  const response = await createInvite(principal.token, projectId, inviteBody({
    targetRole: "principal",
    sectionId: SECTION_FIRST_VIOLIN,
  }));

  assert.equal(response.status, 403);
});

test("principal cannot invite a member across sections", async () => {
  const { projectId } = await seedOwnedProject();
  const principal = seedUserWithToken(fake, { email: "principal@example.test" });
  seedMember(projectId, principal, SECTION_FIRST_VIOLIN, "principal");

  const response = await createInvite(principal.token, projectId, inviteBody({
    targetRole: "member",
    sectionId: SECTION_SECOND_VIOLIN,
  }));

  assert.equal(response.status, 403);
});

test("member cannot create invite code", async () => {
  const { projectId } = await seedOwnedProject();
  const member = seedUserWithToken(fake, { email: "member@example.test" });
  seedMember(projectId, member, SECTION_FIRST_VIOLIN, "member");

  const response = await createInvite(member.token, projectId, inviteBody());

  assert.equal(response.status, 403);
});

test("join-by-code ignores client-supplied sectionId", async () => {
  const { owner, projectId } = await seedOwnedProject();
  const invite = await createInvite(owner.token, projectId, inviteBody({
    targetRole: "member",
    sectionId: SECTION_SECOND_VIOLIN,
  }));
  const joinUser = seedUserWithToken(fake, { email: "joiner@example.test" });

  const joined = await joinInvite(joinUser.token, invite.body.data.inviteCode, {
    sectionId: SECTION_FIRST_VIOLIN,
  });

  assert.equal(joined.status, 201);
  assert.equal(joined.body.data.role, "member");
  assert.equal(joined.body.data.section_id, SECTION_SECOND_VIOLIN);
});

test("used invite code cannot be used again", async () => {
  const { owner, projectId } = await seedOwnedProject();
  const invite = await createInvite(owner.token, projectId, inviteBody());
  const firstUser = seedUserWithToken(fake, { email: "first@example.test" });
  const secondUser = seedUserWithToken(fake, { email: "second@example.test" });

  assert.equal((await joinInvite(firstUser.token, invite.body.data.inviteCode)).status, 201);
  const secondJoin = await joinInvite(secondUser.token, invite.body.data.inviteCode);

  assert.equal(secondJoin.status, 409);
});

test("expired invite code cannot be used", async () => {
  const { owner, projectId } = await seedOwnedProject();
  const inviteCode = seedDbInvite({
    projectId,
    owner,
    tokenId: "expired-token",
    sectionId: SECTION_FIRST_VIOLIN,
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
  });
  const joinUser = seedUserWithToken(fake, { email: "expired@example.test" });

  const response = await joinInvite(joinUser.token, inviteCode);

  assert.equal(response.status, 410);
});

test("revoked invite code cannot be used", async () => {
  const { owner, projectId } = await seedOwnedProject();
  const inviteCode = seedDbInvite({
    projectId,
    owner,
    tokenId: "revoked-token",
    sectionId: SECTION_FIRST_VIOLIN,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    revokedAt: now(),
  });
  const joinUser = seedUserWithToken(fake, { email: "revoked@example.test" });

  const response = await joinInvite(joinUser.token, inviteCode);

  assert.equal(response.status, 410);
});

test("principal shared annotation is visible to same-section member joined by invite", async () => {
  const { owner, projectId } = await seedOwnedProject();
  const score = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_FIRST_VIOLIN,
      title: "First violin",
      piece: { title: "Piece A" },
      xmlContent: "<score-partwise/>",
    },
  });
  assert.equal(score.status, 201);

  const principalInvite = await createInvite(owner.token, projectId, inviteBody({
    targetRole: "principal",
    sectionId: SECTION_FIRST_VIOLIN,
  }));
  const principal = seedUserWithToken(fake, { email: "principal@example.test" });
  assert.equal((await joinInvite(principal.token, principalInvite.body.data.inviteCode)).status, 201);

  const memberInvite = await createInvite(principal.token, projectId, inviteBody({
    targetRole: "member",
    sectionId: SECTION_FIRST_VIOLIN,
  }));
  const member = seedUserWithToken(fake, { email: "member@example.test" });
  assert.equal((await joinInvite(member.token, memberInvite.body.data.inviteCode)).status, 201);

  const shared = await harness.request("POST", `/api/scores/${score.body.data.id}/annotations`, {
    token: principal.token,
    body: annotationBody({ sectionId: SECTION_FIRST_VIOLIN }),
  });
  assert.equal(shared.status, 201);

  const visible = await harness.request("GET", `/api/scores/${score.body.data.id}/annotations`, {
    token: member.token,
  });

  assert.equal(visible.status, 200);
  assert.equal(
    visible.body.data.some((annotation) => annotation.id === shared.body.data.id),
    true,
  );
});
