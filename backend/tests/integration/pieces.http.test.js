require("../helpers/testEnv");
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFakeSupabase } = require("../helpers/fakeSupabase");
const { injectFakeSupabase, startHarness } = require("../helpers/httpHarness");
const {
  seedSections,
  seedUserWithToken,
  SECTION_FIRST_VIOLIN,
} = require("../helpers/fixtures");

const fake = createFakeSupabase();
injectFakeSupabase(fake);
const app = require("../../src/app");
const harness = startHarness(app);

test.after(async () => {
  await harness.stop();
});

const setupScenario = async () => {
  fake.reset({});
  seedSections(fake);
  const owner = seedUserWithToken(fake, { email: "owner@example.test", name: "Owner" });
  const created = await harness.request("POST", "/api/projects", {
    token: owner.token,
    body: { name: "Concert", sectionId: SECTION_FIRST_VIOLIN },
  });
  return { owner, projectId: created.body.data.id };
};

test("GET /pieces: lists pieces for project members", async () => {
  const { owner, projectId } = await setupScenario();
  const { status, body } = await harness.request("GET", `/api/projects/${projectId}/pieces`, {
    token: owner.token,
  });
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.ok(Array.isArray(body.data));
});

test("POST /pieces: concertmaster creates a piece", async () => {
  const { owner, projectId } = await setupScenario();
  const { status, body } = await harness.request("POST", `/api/projects/${projectId}/pieces`, {
    token: owner.token,
    body: { title: "Symphony No. 9", composer: "Dvorak" },
  });
  assert.equal(status, 201);
  assert.equal(body.data.title, "Symphony No. 9");
  assert.equal(body.data.composer, "Dvorak");
  assert.equal(body.data.sort_order, 1);
});

test("DELETE /pieces/:pieceId removes piece", async () => {
  const { owner, projectId } = await setupScenario();
  const created = await harness.request("POST", `/api/projects/${projectId}/pieces`, {
    token: owner.token,
    body: { title: "To delete" },
  });
  const pieceId = created.body.data.id;
  const deleted = await harness.request(
    "DELETE",
    `/api/projects/${projectId}/pieces/${pieceId}`,
    { token: owner.token },
  );
  assert.equal(deleted.status, 200);
  const listed = await harness.request("GET", `/api/projects/${projectId}/pieces`, {
    token: owner.token,
  });
  assert.equal(listed.body.data.length, 0);
});

test("PATCH /pieces/reorder: concertmaster reorders pieces", async () => {
  const { owner, projectId } = await setupScenario();
  const first = await harness.request("POST", `/api/projects/${projectId}/pieces`, {
    token: owner.token,
    body: { title: "First" },
  });
  const second = await harness.request("POST", `/api/projects/${projectId}/pieces`, {
    token: owner.token,
    body: { title: "Second" },
  });
  const third = await harness.request("POST", `/api/projects/${projectId}/pieces`, {
    token: owner.token,
    body: { title: "Third" },
  });

  const reordered = await harness.request("PATCH", `/api/projects/${projectId}/pieces/reorder`, {
    token: owner.token,
    body: {
      orderedPieceIds: [
        third.body.data.id,
        first.body.data.id,
        second.body.data.id,
      ],
    },
  });

  assert.equal(reordered.status, 200);
  assert.deepEqual(
    reordered.body.data.map((piece) => [piece.title, piece.sort_order]),
    [
      ["Third", 1],
      ["First", 2],
      ["Second", 3],
    ],
  );
});
