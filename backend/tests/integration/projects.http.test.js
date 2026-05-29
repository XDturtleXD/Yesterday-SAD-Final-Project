// HTTP-level integration tests for /api/projects/*.
// Verifies the auth middleware → project permission middleware → controller
// → service path produces the documented status codes and envelope.

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

test.beforeEach(() => {
  fake.reset({});
  seedSections(fake);
});

// ---------------------------------------------------------------------------
// Auth gate
// ---------------------------------------------------------------------------

test("GET /api/projects: 401 without token", async () => {
  const { status, body } = await harness.request("GET", "/api/projects");
  assert.equal(status, 401);
  assert.equal(body.success, false);
});

test("POST /api/projects: 401 without token", async () => {
  const { status } = await harness.request("POST", "/api/projects", {
    body: { name: "X", sectionId: SECTION_FIRST_VIOLIN },
  });
  assert.equal(status, 401);
});

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

test("POST /api/projects: 400 when sectionId is missing", async () => {
  const { token } = seedUserWithToken(fake);
  const { status, body } = await harness.request("POST", "/api/projects", {
    token,
    body: { name: "Project A" },
  });
  assert.equal(status, 400);
  assert.match(body.message, /sectionId/);
});

test("POST /api/projects: 400 when name is missing", async () => {
  const { token } = seedUserWithToken(fake);
  const { status } = await harness.request("POST", "/api/projects", {
    token,
    body: { sectionId: SECTION_FIRST_VIOLIN },
  });
  assert.equal(status, 400);
});

test("POST /api/projects: 201 and creator inserted as concertmaster", async () => {
  const { token, user } = seedUserWithToken(fake);
  const { status, body } = await harness.request("POST", "/api/projects", {
    token,
    body: { name: "Project A", description: "test", sectionId: SECTION_FIRST_VIOLIN },
  });
  assert.equal(status, 201);
  assert.equal(body.data.name, "Project A");
  assert.equal(body.data.created_by, user.id);

  const members = fake.rows("project_members");
  assert.equal(members.length, 1);
  assert.equal(members[0].user_id, user.id);
  assert.equal(members[0].role, "concertmaster");
  assert.equal(members[0].section_id, SECTION_FIRST_VIOLIN);
});

// ---------------------------------------------------------------------------
// List + read
// ---------------------------------------------------------------------------

test("GET /api/projects: returns only projects the user belongs to", async () => {
  const alice = seedUserWithToken(fake, { email: "alice@example.test" });
  const bob = seedUserWithToken(fake, { email: "bob@example.test" });

  // Alice creates two projects.
  await harness.request("POST", "/api/projects", {
    token: alice.token,
    body: { name: "Alice 1", sectionId: SECTION_FIRST_VIOLIN },
  });
  await harness.request("POST", "/api/projects", {
    token: alice.token,
    body: { name: "Alice 2", sectionId: SECTION_FIRST_VIOLIN },
  });
  // Bob creates one project.
  await harness.request("POST", "/api/projects", {
    token: bob.token,
    body: { name: "Bob 1", sectionId: SECTION_FIRST_VIOLIN },
  });

  const aliceList = await harness.request("GET", "/api/projects", {
    token: alice.token,
  });
  const bobList = await harness.request("GET", "/api/projects", { token: bob.token });

  assert.equal(aliceList.status, 200);
  assert.equal(aliceList.body.data.length, 2);
  assert.deepEqual(
    aliceList.body.data.map((p) => p.name).sort(),
    ["Alice 1", "Alice 2"],
  );
  assert.equal(bobList.body.data.length, 1);
  assert.equal(bobList.body.data[0].name, "Bob 1");
});

test("GET /api/projects: platform_admin sees every project", async () => {
  seedUserWithToken(fake, { email: "alice@example.test" });
  const adminAuth = seedUserWithToken(fake, {
    email: "admin@example.test",
    systemRole: "platform_admin",
  });

  // platform_admin doesn't need to be a member to see them; create one as
  // someone else.
  const { user: nonAdmin } = seedUserWithToken(fake, { email: "carol@example.test" });
  fake.seedRows("projects", [
    {
      id: "P-ADMIN-VIS-1",
      name: "Visible to admin",
      description: null,
      created_by: nonAdmin.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);

  const { status, body } = await harness.request("GET", "/api/projects", {
    token: adminAuth.token,
  });
  assert.equal(status, 200);
  assert.ok(body.data.some((p) => p.id === "P-ADMIN-VIS-1"));
});

test("GET /api/projects/:projectId: 403 for non-member", async () => {
  const owner = seedUserWithToken(fake, { email: "owner@example.test" });
  const stranger = seedUserWithToken(fake, { email: "stranger@example.test" });

  const created = await harness.request("POST", "/api/projects", {
    token: owner.token,
    body: { name: "Owner Project", sectionId: SECTION_FIRST_VIOLIN },
  });
  const projectId = created.body.data.id;

  const { status } = await harness.request(
    "GET",
    `/api/projects/${projectId}`,
    { token: stranger.token },
  );
  assert.equal(status, 403);
});

test("GET /api/projects/:projectId: returns 404 for unknown project", async () => {
  const { token } = seedUserWithToken(fake);
  const { status } = await harness.request(
    "GET",
    "/api/projects/99999999-9999-9999-9999-999999999999",
    { token },
  );
  // platform_admin would also 404 — we use a regular user; either 403 or 404
  // is documented depending on whether membership is checked first. Service
  // checks project existence first → 404.
  assert.equal(status, 404);
});

test("GET /api/projects/:projectId: owner can read their own project", async () => {
  const owner = seedUserWithToken(fake, { email: "owner2@example.test" });
  const created = await harness.request("POST", "/api/projects", {
    token: owner.token,
    body: { name: "P2", sectionId: SECTION_SECOND_VIOLIN },
  });
  const projectId = created.body.data.id;

  const { status, body } = await harness.request(
    "GET",
    `/api/projects/${projectId}`,
    { token: owner.token },
  );
  assert.equal(status, 200);
  assert.equal(body.data.id, projectId);
  assert.equal(body.data.name, "P2");
});
