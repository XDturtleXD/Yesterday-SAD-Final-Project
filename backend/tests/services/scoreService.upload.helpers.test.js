require("../helpers/testEnv");
const test = require("node:test");
const assert = require("node:assert/strict");

const { _helpers } = require("../../src/services/scoreService");
const {
  canUploadScore,
  assertCanUploadScore,
  normalizeUploadPayload,
  synthesizeInlineStoragePath,
} = _helpers;

const SECTION_A = "00000000-0000-0000-0000-0000000000aa";
const SECTION_B = "00000000-0000-0000-0000-0000000000bb";

test("canUploadScore: platform_admin and concertmaster can upload for any section", () => {
  assert.equal(canUploadScore({ role: "platform_admin" }, SECTION_B), true);
  assert.equal(canUploadScore({ role: "concertmaster", section_id: SECTION_A }, SECTION_B), true);
});

test("canUploadScore: principal only for own section", () => {
  assert.equal(canUploadScore({ role: "principal", section_id: SECTION_A }, SECTION_A), true);
  assert.equal(canUploadScore({ role: "principal", section_id: SECTION_A }, SECTION_B), false);
});

test("canUploadScore: member is never allowed", () => {
  assert.equal(canUploadScore({ role: "member", section_id: SECTION_A }, SECTION_A), false);
});

test("assertCanUploadScore: throws AppError(403) when blocked", () => {
  assert.throws(
    () => assertCanUploadScore({ role: "member" }, SECTION_A),
    (err) => {
      assert.equal(err.statusCode, 403);
      return true;
    },
  );
});

test("normalizeUploadPayload: defaults fileType to musicxml and storageBucket to scores", () => {
  const out = normalizeUploadPayload({
    sectionId: SECTION_A,
    title: "Beethoven 5",
    piece: { title: "Symphony No. 5" },
    xmlContent: "<?xml version=\"1.0\"?><score-partwise/>",
  });
  assert.equal(out.fileType, "musicxml");
  assert.equal(out.storageBucket, "scores");
  assert.equal(out.pieceTitle, "Symphony No. 5");
  assert.equal(out.pieceId, null);
  assert.equal(out.xmlContent.startsWith("<?xml"), true);
});

test("normalizeUploadPayload: trims piece.title and title", () => {
  const out = normalizeUploadPayload({
    sectionId: SECTION_A,
    title: "  Beethoven 5  ",
    piece: { title: "  Symphony No. 5  ", composer: "  Beethoven  " },
    xmlContent: "<?xml?><score-partwise/>",
  });
  assert.equal(out.title, "Beethoven 5");
  assert.equal(out.pieceTitle, "Symphony No. 5");
  assert.equal(out.pieceComposer, "Beethoven");
});

test("normalizeUploadPayload: rejects when sectionId missing", () => {
  assert.throws(
    () =>
      normalizeUploadPayload({
        title: "x",
        piece: { title: "y" },
        xmlContent: "<x/>",
      }),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /sectionId/);
      return true;
    },
  );
});

test("normalizeUploadPayload: rejects when title missing", () => {
  assert.throws(
    () =>
      normalizeUploadPayload({
        sectionId: SECTION_A,
        piece: { title: "y" },
        xmlContent: "<x/>",
      }),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /title/);
      return true;
    },
  );
});

test("normalizeUploadPayload: rejects when neither pieceId nor piece.title provided", () => {
  assert.throws(
    () =>
      normalizeUploadPayload({
        sectionId: SECTION_A,
        title: "x",
        xmlContent: "<x/>",
      }),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /pieceId or piece\.title/);
      return true;
    },
  );
});

test("normalizeUploadPayload: rejects when both pieceId AND piece.title provided", () => {
  assert.throws(
    () =>
      normalizeUploadPayload({
        sectionId: SECTION_A,
        title: "x",
        pieceId: "some-id",
        piece: { title: "y" },
        xmlContent: "<x/>",
      }),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /not both/);
      return true;
    },
  );
});

test("normalizeUploadPayload: rejects when neither xmlContent nor storagePath provided", () => {
  assert.throws(
    () =>
      normalizeUploadPayload({
        sectionId: SECTION_A,
        title: "x",
        piece: { title: "y" },
      }),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /xmlContent or storagePath/);
      return true;
    },
  );
});

test("normalizeUploadPayload: rejects unknown fileType", () => {
  assert.throws(
    () =>
      normalizeUploadPayload({
        sectionId: SECTION_A,
        title: "x",
        piece: { title: "y" },
        xmlContent: "<x/>",
        fileType: "pdf",
      }),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /Invalid fileType/);
      return true;
    },
  );
});

test("normalizeUploadPayload: rejects xmlContent over 5MB with 413", () => {
  const huge = "<x>" + "a".repeat(5 * 1024 * 1024 + 1) + "</x>";
  assert.throws(
    () =>
      normalizeUploadPayload({
        sectionId: SECTION_A,
        title: "x",
        piece: { title: "y" },
        xmlContent: huge,
      }),
    (err) => {
      assert.equal(err.statusCode, 413);
      return true;
    },
  );
});

test("normalizeUploadPayload: accepts storagePath-only upload (no xmlContent)", () => {
  const out = normalizeUploadPayload({
    sectionId: SECTION_A,
    title: "x",
    piece: { title: "y" },
    storagePath: "projects/p1/violin1.musicxml",
  });
  assert.equal(out.xmlContent, null);
  assert.equal(out.storagePath, "projects/p1/violin1.musicxml");
});

test("synthesizeInlineStoragePath: uses mxl extension when fileType is mxl", () => {
  const path = synthesizeInlineStoragePath({
    projectId: "P",
    pieceId: "PC",
    sectionId: "SEC",
    fileType: "mxl",
  });
  assert.equal(path, "inline/P/PC/SEC.mxl");
});

test("synthesizeInlineStoragePath: defaults to musicxml extension otherwise", () => {
  assert.equal(
    synthesizeInlineStoragePath({
      projectId: "P",
      pieceId: "PC",
      sectionId: "SEC",
      fileType: "musicxml",
    }),
    "inline/P/PC/SEC.musicxml",
  );
  assert.equal(
    synthesizeInlineStoragePath({
      projectId: "P",
      pieceId: "PC",
      sectionId: "SEC",
      fileType: "xml",
    }),
    "inline/P/PC/SEC.musicxml",
  );
});
