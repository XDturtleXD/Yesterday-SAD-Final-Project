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
