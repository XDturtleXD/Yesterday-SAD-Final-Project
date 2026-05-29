// HTTP-level integration tests for /api/projects/:projectId/scores and
// /api/scores/:scoreId. Exercises auth → project permission → upload.

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

const setupScenario = async ({ ownerSection = SECTION_FIRST_VIOLIN } = {}) => {
  fake.reset({});
  seedSections(fake);
  const owner = seedUserWithToken(fake, { email: "owner@example.test", name: "Owner" });
  // Owner creates a project (becomes concertmaster).
  const created = await harness.request("POST", "/api/projects", {
    token: owner.token,
    body: { name: "Concert", sectionId: ownerSection },
  });
  return { owner, projectId: created.body.data.id };
};

// ---------------------------------------------------------------------------
// Upload happy path
// ---------------------------------------------------------------------------

test("POST /scores: concertmaster uploads and gets 201 + score row", async () => {
  const { owner, projectId } = await setupScenario();
  const { status, body } = await harness.request(
    "POST",
    `/api/projects/${projectId}/scores`,
    {
      token: owner.token,
      body: {
        sectionId: SECTION_FIRST_VIOLIN,
        title: "Vln 1 — Beethoven 5",
        piece: { title: "Symphony 5", composer: "Beethoven" },
        xmlContent: '<?xml version="1.0"?><score-partwise/>',
      },
    },
  );
  assert.equal(status, 201);
  assert.equal(body.success, true);
  assert.equal(body.data.project_id, projectId);
  assert.equal(body.data.section_id, SECTION_FIRST_VIOLIN);
  assert.equal(body.data.title, "Vln 1 — Beethoven 5");
  assert.equal(body.data.file_type, "musicxml");
  assert.ok(body.data.id);
});

test("POST /scores: 401 without token", async () => {
  const { projectId } = await setupScenario();
  const { status } = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    body: {
      sectionId: SECTION_FIRST_VIOLIN,
      title: "x",
      piece: { title: "y" },
      xmlContent: "<x/>",
    },
  });
  assert.equal(status, 401);
});

test("POST /scores: 403 when not a project member", async () => {
  const { projectId } = await setupScenario();
  const stranger = seedUserWithToken(fake, { email: "stranger@example.test" });
  const { status } = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: stranger.token,
    body: {
      sectionId: SECTION_FIRST_VIOLIN,
      title: "x",
      piece: { title: "y" },
      xmlContent: "<x/>",
    },
  });
  assert.equal(status, 403);
});

test("POST /scores: 400 when required fields missing", async () => {
  const { owner, projectId } = await setupScenario();
  const { status, body } = await harness.request(
    "POST",
    `/api/projects/${projectId}/scores`,
    {
      token: owner.token,
      body: { sectionId: SECTION_FIRST_VIOLIN, title: "x", xmlContent: "<x/>" },
      // no pieceId / piece
    },
  );
  assert.equal(status, 400);
  assert.match(body.message, /pieceId or piece\.title/);
});

test("POST /scores: 409 when uploading twice for same (piece, section)", async () => {
  const { owner, projectId } = await setupScenario();
  const baseBody = {
    sectionId: SECTION_FIRST_VIOLIN,
    title: "x",
    piece: { title: "Same piece" },
    xmlContent: "<x/>",
  };
  const first = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: baseBody,
  });
  assert.equal(first.status, 201);
  const second = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: { ...baseBody, title: "x2" },
  });
  assert.equal(second.status, 409);
});

test("POST /scores: principal can upload only to own section", async () => {
  const { projectId } = await setupScenario();
  // Add a principal for second violin via direct member seed.
  const principal = seedUserWithToken(fake, { email: "p@example.test" });
  fake.seedRows("project_members", [
    {
      id: "pm-principal",
      project_id: projectId,
      user_id: principal.user.id,
      section_id: SECTION_SECOND_VIOLIN,
      role: "principal",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);

  // Own section: OK.
  const ownSection = await harness.request(
    "POST",
    `/api/projects/${projectId}/scores`,
    {
      token: principal.token,
      body: {
        sectionId: SECTION_SECOND_VIOLIN,
        title: "Vln 2 — A",
        piece: { title: "Piece" },
        xmlContent: "<x/>",
      },
    },
  );
  assert.equal(ownSection.status, 201);

  // Other section: 403.
  const otherSection = await harness.request(
    "POST",
    `/api/projects/${projectId}/scores`,
    {
      token: principal.token,
      body: {
        sectionId: SECTION_FIRST_VIOLIN,
        title: "Vln 1 — A",
        piece: { title: "Piece" },
        xmlContent: "<x/>",
      },
    },
  );
  assert.equal(otherSection.status, 403);
});

// ---------------------------------------------------------------------------
// List + read
// ---------------------------------------------------------------------------

test("GET /projects/:projectId/scores: returns uploaded scores", async () => {
  const { owner, projectId } = await setupScenario();
  await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_FIRST_VIOLIN,
      title: "Vln 1",
      piece: { title: "P" },
      xmlContent: "<x/>",
    },
  });
  await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_SECOND_VIOLIN,
      title: "Vln 2",
      piece: { title: "P" },
      xmlContent: "<x/>",
    },
  });
  const { status, body } = await harness.request(
    "GET",
    `/api/projects/${projectId}/scores`,
    { token: owner.token },
  );
  assert.equal(status, 200);
  assert.equal(body.data.length, 2);
  const titles = body.data.map((s) => s.title).sort();
  assert.deepEqual(titles, ["Vln 1", "Vln 2"]);
});

test("GET /scores/:scoreId: 403 when scope-section principal opens another section's score", async () => {
  const { owner, projectId } = await setupScenario();
  const upload = await harness.request(
    "POST",
    `/api/projects/${projectId}/scores`,
    {
      token: owner.token,
      body: {
        sectionId: SECTION_FIRST_VIOLIN,
        title: "Vln 1",
        piece: { title: "P" },
        xmlContent: "<x/>",
      },
    },
  );
  const scoreId = upload.body.data.id;

  // Principal in section 2 tries to read a section 1 score.
  const principal = seedUserWithToken(fake, { email: "p2@example.test" });
  fake.seedRows("project_members", [
    {
      id: "pm-principal-2",
      project_id: projectId,
      user_id: principal.user.id,
      section_id: SECTION_SECOND_VIOLIN,
      role: "principal",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);

  const { status } = await harness.request("GET", `/api/scores/${scoreId}`, {
    token: principal.token,
  });
  assert.equal(status, 403);
});
