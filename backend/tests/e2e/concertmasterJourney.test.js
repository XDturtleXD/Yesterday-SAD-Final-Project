// E2E user journey: a concertmaster registers, logs in, creates a project,
// uploads two scores in different sections, and lists them back.
//
// Differs from the integration tests in that it walks one full user story
// across multiple endpoints with no internal shortcuts (besides seeding
// sections, which the schema needs as static reference data).

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

test("E2E: concertmaster → register → login → create project → upload 2 scores → list", async () => {
  fake.reset({});
  seedSections(fake);

  // 1. Register
  const registerRes = await harness.request("POST", "/api/auth/register", {
    body: {
      email: "maestro@example.test",
      password: "supersecret123",
      name: "Maestro",
    },
  });
  assert.equal(registerRes.status, 201, "register should succeed");

  // 2. Log in (token should be valid)
  const loginRes = await harness.request("POST", "/api/auth/login", {
    body: { email: "maestro@example.test", password: "supersecret123" },
  });
  assert.equal(loginRes.status, 200);
  const token = loginRes.body.data.token;
  assert.equal(typeof token, "string");

  // 3. GET /auth/me with that token
  const meRes = await harness.request("GET", "/api/auth/me", { token });
  assert.equal(meRes.status, 200);
  assert.equal(meRes.body.data.email, "maestro@example.test");
  assert.ok(!("password_hash" in meRes.body.data));

  // 4. Create a project (becomes concertmaster of first violin section)
  const projectRes = await harness.request("POST", "/api/projects", {
    token,
    body: {
      name: "Spring Concert 2026",
      description: "MVP test project",
      sectionId: SECTION_FIRST_VIOLIN,
    },
  });
  assert.equal(projectRes.status, 201);
  const projectId = projectRes.body.data.id;

  // 5. Upload a score for first violin (own section)
  const upload1 = await harness.request(
    "POST",
    `/api/projects/${projectId}/scores`,
    {
      token,
      body: {
        sectionId: SECTION_FIRST_VIOLIN,
        title: "Vln 1 — Beethoven 5 Mvt I",
        piece: { title: "Symphony 5", composer: "Beethoven" },
        xmlContent: '<?xml version="1.0"?><score-partwise/>',
      },
    },
  );
  assert.equal(upload1.status, 201);

  // 6. Upload a score for a DIFFERENT section — concertmaster allowed
  const upload2 = await harness.request(
    "POST",
    `/api/projects/${projectId}/scores`,
    {
      token,
      body: {
        sectionId: SECTION_SECOND_VIOLIN,
        title: "Vln 2 — Beethoven 5 Mvt I",
        piece: { title: "Symphony 5", composer: "Beethoven" },
        xmlContent: '<?xml version="1.0"?><score-partwise/>',
      },
    },
  );
  assert.equal(upload2.status, 201);
  // Both uploads should attach to the SAME piece row.
  assert.equal(upload1.body.data.piece_id, upload2.body.data.piece_id);

  // 7. List scores and verify both are visible to the concertmaster
  const listRes = await harness.request(
    "GET",
    `/api/projects/${projectId}/scores`,
    { token },
  );
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.data.length, 2);
  const titles = listRes.body.data.map((s) => s.title).sort();
  assert.deepEqual(titles, [
    "Vln 1 — Beethoven 5 Mvt I",
    "Vln 2 — Beethoven 5 Mvt I",
  ]);

  // 8. Read one score by id and verify it surfaces section info
  const scoreId = upload1.body.data.id;
  const readRes = await harness.request("GET", `/api/scores/${scoreId}`, { token });
  assert.equal(readRes.status, 200);
  assert.equal(readRes.body.data.id, scoreId);
  assert.equal(readRes.body.data.section_id, SECTION_FIRST_VIOLIN);
});
