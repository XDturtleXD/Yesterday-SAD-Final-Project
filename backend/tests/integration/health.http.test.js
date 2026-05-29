require("../helpers/testEnv");
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFakeSupabase } = require("../helpers/fakeSupabase");
const { injectFakeSupabase, startHarness } = require("../helpers/httpHarness");

const fake = createFakeSupabase();
injectFakeSupabase(fake);
const app = require("../../src/app");
const harness = startHarness(app);

test.after(async () => {
  await harness.stop();
});

test("GET /api/health returns 200 + success envelope", async () => {
  const { status, body } = await harness.request("GET", "/api/health");
  assert.equal(status, 200);
  assert.equal(body.success, true);
  // body.data should exist; shape is implementation-defined but must be present.
  assert.ok(Object.prototype.hasOwnProperty.call(body, "data"));
});

test("404 from unknown route uses the unified error envelope", async () => {
  const { status, body } = await harness.request("GET", "/api/no-such-endpoint");
  assert.equal(status, 404);
  assert.equal(body.success, false);
  assert.equal(typeof body.message, "string");
  assert.ok(body.message.length > 0);
});
