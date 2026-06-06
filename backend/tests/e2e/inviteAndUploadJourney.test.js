// E2E: a concertmaster creates a project, issues a section-bound principal
// invite code, and the joined principal exercises section-scoped upload
// permissions.

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

  // 3. CM mints an invite code for the second violin principal
  const inviteRes = await harness.request(
    "POST",
    `/api/projects/${projectId}/invite-code`,
    {
      token: cmToken,
      body: {
        targetRole: "principal",
        sectionId: SECTION_SECOND_VIOLIN,
      },
    },
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

  // 5. Principal joins via invite code → role 'principal', section second_violin
  const join = await harness.request("POST", "/api/projects/join-by-code", {
    token: principalToken,
    body: { inviteCode },
  });
  assert.equal(join.status, 201);
  assert.equal(join.body.data.role, "principal");
  assert.equal(join.body.data.section_id, SECTION_SECOND_VIOLIN);

  // 6. Principal uploads to OWN section → 201
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

  // 7. Principal CANNOT upload to first_violin → 403
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

  // 8. CM uploads to first_violin → 201; both scores attach to the same piece
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

  // 9. CM lists scores: sees BOTH sections
  const cmList = await harness.request("GET", `/api/projects/${projectId}/scores`, {
    token: cmToken,
  });
  assert.equal(cmList.body.data.length, 2);

  // 10. Principal lists scores: sees all project sections
  const principalList = await harness.request(
    "GET",
    `/api/projects/${projectId}/scores`,
    { token: principalToken },
  );
  assert.equal(principalList.body.data.length, 2);
  assert.deepEqual(
    principalList.body.data.map((score) => score.section_id).sort(),
    [SECTION_FIRST_VIOLIN, SECTION_SECOND_VIOLIN].sort(),
  );
});
