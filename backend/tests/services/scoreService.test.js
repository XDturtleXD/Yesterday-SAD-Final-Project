require("../helpers/testEnv");
const test = require("node:test");
const assert = require("node:assert/strict");

const { canViewScore, assertCanViewScore } = require("../../src/services/scoreService");

const SECTION_A = "00000000-0000-0000-0000-0000000000aa";
const SECTION_B = "00000000-0000-0000-0000-0000000000bb";

const scoreInA = { id: "s1", section_id: SECTION_A };
const scoreInB = { id: "s2", section_id: SECTION_B };

test("canViewScore: platform_admin sees every section", () => {
  const m = { role: "platform_admin", section_id: null };
  assert.equal(canViewScore(scoreInA, m), true);
  assert.equal(canViewScore(scoreInB, m), true);
});

test("canViewScore: concertmaster sees every section", () => {
  const m = { role: "concertmaster", section_id: SECTION_A };
  assert.equal(canViewScore(scoreInA, m), true);
  assert.equal(canViewScore(scoreInB, m), true);
});

test("canViewScore: principal only sees own section", () => {
  const m = { role: "principal", section_id: SECTION_A };
  assert.equal(canViewScore(scoreInA, m), true);
  assert.equal(canViewScore(scoreInB, m), false);
});

test("canViewScore: member only sees own section", () => {
  const m = { role: "member", section_id: SECTION_A };
  assert.equal(canViewScore(scoreInA, m), true);
  assert.equal(canViewScore(scoreInB, m), false);
});

test("canViewScore: returns false when score is missing", () => {
  const m = { role: "concertmaster", section_id: SECTION_A };
  assert.equal(canViewScore(null, m), false);
});

test("canViewScore: unknown role returns false", () => {
  const m = { role: "guest", section_id: SECTION_A };
  assert.equal(canViewScore(scoreInA, m), false);
});

test("assertCanViewScore throws AppError(403) when blocked", () => {
  const m = { role: "principal", section_id: SECTION_A };
  assert.throws(() => assertCanViewScore(scoreInB, m), (err) => {
    assert.equal(err.name, "AppError");
    assert.equal(err.statusCode, 403);
    return true;
  });
});

test("assertCanViewScore is a no-op when allowed", () => {
  const m = { role: "concertmaster", section_id: SECTION_A };
  assert.doesNotThrow(() => assertCanViewScore(scoreInB, m));
});
