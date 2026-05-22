require("../helpers/testEnv");
const test = require("node:test");
const assert = require("node:assert/strict");

const { _helpers } = require("../../src/services/historyService");
const {
  isAdminRole,
  canCommit,
  assertCanCommit,
  assertConcertmaster,
  normalizeSnapshot,
  buildVersionMap,
  filterVisibleVersions,
} = _helpers;

const SECTION_A = "00000000-0000-0000-0000-0000000000aa";
const SECTION_B = "00000000-0000-0000-0000-0000000000bb";

test("isAdminRole: concertmaster and platform_admin only", () => {
  assert.equal(isAdminRole("concertmaster"), true);
  assert.equal(isAdminRole("platform_admin"), true);
  assert.equal(isAdminRole("principal"), false);
  assert.equal(isAdminRole("member"), false);
  assert.equal(isAdminRole(undefined), false);
});

test("canCommit: principal/concertmaster/platform_admin allowed, member not", () => {
  assert.equal(canCommit({ role: "concertmaster" }), true);
  assert.equal(canCommit({ role: "principal" }), true);
  assert.equal(canCommit({ role: "platform_admin" }), true);
  assert.equal(canCommit({ role: "member" }), false);
  assert.equal(canCommit(null), false);
});

test("assertCanCommit throws AppError(403) for member", () => {
  assert.throws(() => assertCanCommit({ role: "member" }), (err) => {
    assert.equal(err.statusCode, 403);
    return true;
  });
});

test("assertConcertmaster only allows concertmaster/platform_admin", () => {
  assert.doesNotThrow(() => assertConcertmaster({ role: "concertmaster" }, "merge branches"));
  assert.doesNotThrow(() => assertConcertmaster({ role: "platform_admin" }, "merge branches"));
  assert.throws(() => assertConcertmaster({ role: "principal" }, "merge branches"), (err) => {
    assert.equal(err.statusCode, 403);
    // message includes the action so the API stays informative.
    assert.match(err.message, /merge branches/);
    return true;
  });
});

test("normalizeSnapshot defaults storageBucket to 'scores' and coerces optional fields", () => {
  const out = normalizeSnapshot({
    scoreId: "s1",
    storagePath: "p/x.musicxml",
    fileType: "musicxml",
  });
  assert.deepEqual(out, {
    score_id: "s1",
    storage_bucket: "scores",
    storage_path: "p/x.musicxml",
    file_type: "musicxml",
    original_filename: null,
    mime_type: null,
    file_size_bytes: null,
  });
});

test("normalizeSnapshot throws on missing required fields", () => {
  assert.throws(() => normalizeSnapshot({ scoreId: "s1", storagePath: "p" }), (err) => {
    assert.equal(err.statusCode, 400);
    return true;
  });
});

test("normalizeSnapshot rejects unsupported file_type", () => {
  assert.throws(
    () => normalizeSnapshot({ scoreId: "s1", storagePath: "p", fileType: "pdf" }),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /Invalid fileType/);
      return true;
    },
  );
});

test("buildVersionMap keys by score_id", () => {
  const map = buildVersionMap([
    { score_id: "s1", storage_path: "p1" },
    { score_id: "s2", storage_path: "p2" },
  ]);
  assert.equal(map.size, 2);
  assert.equal(map.get("s1").storage_path, "p1");
  assert.equal(map.get("s2").storage_path, "p2");
});

test("filterVisibleVersions: admin/concertmaster sees everything", () => {
  const versions = [
    { score_id: "s1" },
    { score_id: "s2" },
  ];
  const scoresMeta = [
    { id: "s1", section_id: SECTION_A },
    { id: "s2", section_id: SECTION_B },
  ];
  assert.equal(filterVisibleVersions(versions, scoresMeta, { role: "platform_admin" }).length, 2);
  assert.equal(filterVisibleVersions(versions, scoresMeta, { role: "concertmaster" }).length, 2);
  assert.equal(filterVisibleVersions(versions, scoresMeta, null).length, 2);
});

test("filterVisibleVersions: principal/member sees only own section", () => {
  const versions = [
    { score_id: "s1" },
    { score_id: "s2" },
  ];
  const scoresMeta = [
    { id: "s1", section_id: SECTION_A },
    { id: "s2", section_id: SECTION_B },
  ];
  const principal = { role: "principal", section_id: SECTION_A };
  const member = { role: "member", section_id: SECTION_B };
  assert.deepEqual(
    filterVisibleVersions(versions, scoresMeta, principal).map((v) => v.score_id),
    ["s1"],
  );
  assert.deepEqual(
    filterVisibleVersions(versions, scoresMeta, member).map((v) => v.score_id),
    ["s2"],
  );
});
