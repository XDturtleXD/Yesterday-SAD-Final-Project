// HTTP-level integration tests for /api/auth/*.
// Goes through Express + middlewares + controller + authService + bcrypt for
// at least one register/login pair, so the actual password hashing path is
// exercised once end-to-end.

require("../helpers/testEnv");
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFakeSupabase } = require("../helpers/fakeSupabase");
const { injectFakeSupabase, startHarness } = require("../helpers/httpHarness");
const {
  seedSections,
  seedUserWithToken,
  BCRYPT_PASSWORD123,
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

test("POST /api/auth/register: 201 + sanitized user (no password_hash)", async () => {
  const { status, body } = await harness.request("POST", "/api/auth/register", {
    body: { email: "alice@example.test", password: "supersecret", name: "Alice" },
  });
  assert.equal(status, 201);
  assert.equal(body.success, true);
  assert.equal(body.data.email, "alice@example.test");
  assert.equal(body.data.name, "Alice");
  assert.ok(!("password_hash" in body.data), "password_hash must not leak");
});

test("POST /api/auth/register: 400 when fields missing", async () => {
  const { status, body } = await harness.request("POST", "/api/auth/register", {
    body: { email: "alice@example.test" },
  });
  assert.equal(status, 400);
  assert.equal(body.success, false);
});

test("POST /api/auth/register: 409 on duplicate email", async () => {
  await harness.request("POST", "/api/auth/register", {
    body: { email: "bob@example.test", password: "pw12345678", name: "Bob" },
  });
  const { status } = await harness.request("POST", "/api/auth/register", {
    body: { email: "bob@example.test", password: "pw12345678", name: "Bob2" },
  });
  assert.equal(status, 409);
});

test("POST /api/auth/login: returns token + user matching email", async () => {
  // Seed user with the well-known password123 bcrypt hash so bcrypt.compare
  // succeeds.
  seedUserWithToken(fake, { email: "carol@example.test", name: "Carol" });

  const { status, body } = await harness.request("POST", "/api/auth/login", {
    body: { email: "carol@example.test", password: "password123" },
  });
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(typeof body.data.token, "string");
  assert.equal(body.data.user.email, "carol@example.test");
  assert.ok(!("password_hash" in body.data.user));
});

test("POST /api/auth/login: 401 on bad password", async () => {
  seedUserWithToken(fake, { email: "dan@example.test" });
  const { status } = await harness.request("POST", "/api/auth/login", {
    body: { email: "dan@example.test", password: "wrong" },
  });
  assert.equal(status, 401);
});

test("POST /api/auth/login: 401 on unknown email", async () => {
  const { status } = await harness.request("POST", "/api/auth/login", {
    body: { email: "nope@example.test", password: "anything" },
  });
  assert.equal(status, 401);
});

test("GET /api/auth/me: 401 without Authorization header", async () => {
  const { status } = await harness.request("GET", "/api/auth/me");
  assert.equal(status, 401);
});

test("GET /api/auth/me: 401 on malformed Authorization header", async () => {
  const { status } = await harness.request("GET", "/api/auth/me", {
    headers: { Authorization: "NotBearer abc" },
  });
  assert.equal(status, 401);
});

test("GET /api/auth/me: returns the current user when token is valid", async () => {
  const { token, user } = seedUserWithToken(fake, {
    email: "eve@example.test",
    name: "Eve",
  });
  const { status, body } = await harness.request("GET", "/api/auth/me", { token });
  assert.equal(status, 200);
  assert.equal(body.data.id, user.id);
  assert.equal(body.data.email, "eve@example.test");
});
