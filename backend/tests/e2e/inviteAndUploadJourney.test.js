// E2E: a concertmaster creates a project and issues an invite code; another
// user joins the project as a member, gets upgraded to principal via direct
// seed (no role-update endpoint exists yet), and then exercises their
// section-scoped upload permissions.

require("../helpers/testEnv");
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFakeSupabase } = require("../helpers/fakeSupabase");
const { injectFakeSupabase, startHarness } = require("../helpers/httpHarness");
const {
  seedSections,
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

test("E2E: invite flow + section-scoped principal upload permissions", async () => {
  fake.reset({});
  seedSections(fake);

  // 1. Concertmaster registers + logs in
  await harness.request("POST", "/api/auth/register", {
    body: { email: "cm@example.test", password: "password123", name: "CM" },
  });
  const cmLogin = await harness.request("POST", "/api/auth/login", {
    body: { email: "cm@example.test", password: "password123" },
  });
  const cmToken = cmLogin.body.data.token;

  // 2. Create project (CM auto-joins as concertmaster of section first_violin)
  const project = await harness.request("POST", "/api/projects", {
    token: cmToken,
    body: { name: "Spring Concert", sectionId: SECTION_FIRST_VIOLIN },
  });
  assert.equal(project.status, 201);
  const projectId = project.body.data.id;

  // 3. CM mints an invite code
  const inviteRes = await harness.request(
    "POST",
    `/api/projects/${projectId}/invite-code`,
    { token: cmToken, body: {} },
  );
  assert.equal(inviteRes.status, 200);
  const inviteCode = inviteRes.body.data.inviteCode;

  // 4. A second user registers + logs in
  await harness.request("POST", "/api/auth/register", {
    body: { email: "p@example.test", password: "password123", name: "Principal" },
  });
  const principalLogin = await harness.request("POST", "/api/auth/login", {
    body: { email: "p@example.test", password: "password123" },
  });
  const principalToken = principalLogin.body.data.token;
  const principalUserId = principalLogin.body.data.user.id;

  // 5. Principal joins via invite code → role 'member', section second_violin
  const join = await harness.request("POST", "/api/projects/join-by-code", {
    token: principalToken,
    body: { inviteCode, sectionId: SECTION_SECOND_VIOLIN },
  });
  assert.equal(join.status, 201);
  assert.equal(join.body.data.role, "member");

  // As a member, they CANNOT upload at all.
  const memberUpload = await harness.request(
    "POST",
    `/api/projects/${projectId}/scores`,
    {
      token: principalToken,
      body: {
        sectionId: SECTION_SECOND_VIOLIN,
        title: "Vln 2 — A",
        piece: { title: "P" },
        xmlContent: "<x/>",
      },
    },
  );
  assert.equal(memberUpload.status, 403);

  // 6. Promote the joined user to principal of section_second_violin via
  // direct DB write (there's no role-update API yet; this is what an admin
  // would do today through Supabase).
  const members = fake.rows("project_members");
  const target = members.find((m) => m.user_id === principalUserId);
  assert.ok(target, "joined principal member row must exist");
  fake.reset({
    sections: fake.rows("sections"),
    users: fake.rows("users"),
    projects: fake.rows("projects"),
    project_members: members.map((m) =>
      m.id === target.id ? { ...m, role: "principal" } : m,
    ),
  });

  // 7. Principal uploads to OWN section → 201
  const ownUpload = await harness.request(
    "POST",
    `/api/projects/${projectId}/scores`,
    {
      token: principalToken,
      body: {
        sectionId: SECTION_SECOND_VIOLIN,
        title: "Vln 2 — A",
        piece: { title: "Beethoven 5" },
        xmlContent: "<x/>",
      },
    },
  );
  assert.equal(ownUpload.status, 201);

  // 8. Principal CANNOT upload to first_violin → 403
  const crossUpload = await harness.request(
    "POST",
    `/api/projects/${projectId}/scores`,
    {
      token: principalToken,
      body: {
        sectionId: SECTION_FIRST_VIOLIN,
        title: "Vln 1 — A",
        piece: { title: "Beethoven 5" },
        xmlContent: "<x/>",
      },
    },
  );
  assert.equal(crossUpload.status, 403);

  // 9. CM uploads to first_violin → 201; both scores attach to the same piece
  const cmUpload = await harness.request(
    "POST",
    `/api/projects/${projectId}/scores`,
    {
      token: cmToken,
      body: {
        sectionId: SECTION_FIRST_VIOLIN,
        title: "Vln 1 — A",
        piece: { title: "Beethoven 5" },
        xmlContent: "<x/>",
      },
    },
  );
  assert.equal(cmUpload.status, 201);
  assert.equal(cmUpload.body.data.piece_id, ownUpload.body.data.piece_id);

  // 10. CM lists scores: sees BOTH sections
  const cmList = await harness.request("GET", `/api/projects/${projectId}/scores`, {
    token: cmToken,
  });
  assert.equal(cmList.body.data.length, 2);

  // 11. Principal lists scores: only own section
  const principalList = await harness.request(
    "GET",
    `/api/projects/${projectId}/scores`,
    { token: principalToken },
  );
  assert.equal(principalList.body.data.length, 1);
  assert.equal(principalList.body.data[0].section_id, SECTION_SECOND_VIOLIN);
});
