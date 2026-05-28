require("../helpers/testEnv");
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFakeSupabase } = require("../helpers/fakeSupabase");

// Inject the fake supabase before the service module is required.
const supabaseModulePath = require.resolve("../../src/config/supabase");
const fake = createFakeSupabase();
require.cache[supabaseModulePath] = {
  id: supabaseModulePath,
  filename: supabaseModulePath,
  loaded: true,
  exports: fake,
};

const scoreService = require("../../src/services/scoreService");

const PROJECT = "11111111-1111-1111-1111-111111111111";
const SECTION_A = "00000000-0000-0000-0000-0000000000aa";
const SECTION_B = "00000000-0000-0000-0000-0000000000bb";
const USER_CM = "22222222-2222-2222-2222-222222222001";
const USER_PRINCIPAL_A = "22222222-2222-2222-2222-222222222002";
const USER_MEMBER = "22222222-2222-2222-2222-222222222003";

const membershipCM = { role: "concertmaster", section_id: SECTION_A };
const membershipPrincipalA = { role: "principal", section_id: SECTION_A };
const membershipMember = { role: "member", section_id: SECTION_B };

const baseFixture = () => ({
  sections: [
    { id: SECTION_A, code: "first_violin", name: "小提琴第一部", sort_order: 1 },
    { id: SECTION_B, code: "second_violin", name: "小提琴第二部", sort_order: 2 },
  ],
  pieces: [],
  scores: [],
});

const baseBody = (overrides = {}) => ({
  sectionId: SECTION_A,
  title: "Violin I — Beethoven 5",
  piece: { title: "Symphony No. 5", composer: "Beethoven" },
  fileType: "musicxml",
  xmlContent: '<?xml version="1.0"?><score-partwise/>',
  originalFilename: "v1-beethoven5.musicxml",
  ...overrides,
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

test("uploadScore: concertmaster creates a piece on the fly and inserts the score", async () => {
  fake.reset(baseFixture());

  const score = await scoreService.uploadScore(
    baseBody(),
    PROJECT,
    { id: USER_CM },
    membershipCM,
  );

  assert.equal(score.project_id, PROJECT);
  assert.equal(score.section_id, SECTION_A);
  assert.equal(score.file_type, "musicxml");
  assert.equal(score.storage_bucket, "scores");
  assert.equal(score.title, "Violin I — Beethoven 5");
  assert.ok(score.piece_id, "piece_id should be populated");
  // Inline upload should synthesise a storage_path so the NOT NULL holds.
  assert.match(score.storage_path, /^inline\/.+\.musicxml$/);

  // Piece was auto-created with sort_order 1.
  const pieces = fake.rows("pieces");
  assert.equal(pieces.length, 1);
  assert.equal(pieces[0].title, "Symphony No. 5");
  assert.equal(pieces[0].sort_order, 1);
  assert.equal(pieces[0].composer, "Beethoven");
});

test("uploadScore: second upload for the SAME piece title reuses the piece", async () => {
  fake.reset(baseFixture());

  await scoreService.uploadScore(baseBody(), PROJECT, { id: USER_CM }, membershipCM);
  // Upload another section's score for the same piece.
  const second = await scoreService.uploadScore(
    baseBody({
      sectionId: SECTION_B,
      title: "Violin II — Beethoven 5",
      originalFilename: "v2-beethoven5.musicxml",
    }),
    PROJECT,
    { id: USER_CM },
    membershipCM,
  );

  const pieces = fake.rows("pieces");
  assert.equal(pieces.length, 1, "should NOT create a second piece for the same title");
  assert.equal(second.piece_id, pieces[0].id);
});

test("uploadScore: explicit pieceId reuses that piece without title lookup", async () => {
  const fixture = baseFixture();
  fixture.pieces.push({
    id: "piece-known",
    project_id: PROJECT,
    title: "Dvorak 9",
    composer: "Dvorak",
    sort_order: 1,
  });
  fake.reset(fixture);

  const score = await scoreService.uploadScore(
    {
      sectionId: SECTION_A,
      title: "V1 — Dvorak 9",
      pieceId: "piece-known",
      xmlContent: "<x/>",
    },
    PROJECT,
    { id: USER_CM },
    membershipCM,
  );
  assert.equal(score.piece_id, "piece-known");
});

test("uploadScore: storagePath-only upload skips xml_content", async () => {
  fake.reset(baseFixture());

  const score = await scoreService.uploadScore(
    {
      sectionId: SECTION_A,
      title: "V1 — Beethoven 5",
      piece: { title: "Symphony No. 5" },
      storagePath: "projects/p1/violin1.musicxml",
      storageBucket: "scores",
    },
    PROJECT,
    { id: USER_CM },
    membershipCM,
  );
  assert.equal(score.storage_path, "projects/p1/violin1.musicxml");
  assert.equal(score.xml_content, null);
});

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

test("uploadScore: principal can upload to their own section", async () => {
  fake.reset(baseFixture());
  const score = await scoreService.uploadScore(
    baseBody({ sectionId: SECTION_A }),
    PROJECT,
    { id: USER_PRINCIPAL_A },
    membershipPrincipalA,
  );
  assert.equal(score.created_by, USER_PRINCIPAL_A);
});

test("uploadScore: principal CANNOT upload to another section", async () => {
  fake.reset(baseFixture());
  await assert.rejects(
    () =>
      scoreService.uploadScore(
        baseBody({ sectionId: SECTION_B }),
        PROJECT,
        { id: USER_PRINCIPAL_A },
        membershipPrincipalA,
      ),
    (err) => {
      assert.equal(err.statusCode, 403);
      return true;
    },
  );
});

test("uploadScore: member is always rejected with 403", async () => {
  fake.reset(baseFixture());
  await assert.rejects(
    () =>
      scoreService.uploadScore(
        baseBody({ sectionId: SECTION_B }),
        PROJECT,
        { id: USER_MEMBER },
        membershipMember,
      ),
    (err) => {
      assert.equal(err.statusCode, 403);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Validation surfaced at the service layer
// ---------------------------------------------------------------------------

test("uploadScore: 400 when sectionId does not exist", async () => {
  fake.reset(baseFixture());
  await assert.rejects(
    () =>
      scoreService.uploadScore(
        baseBody({ sectionId: "99999999-9999-9999-9999-999999999999" }),
        PROJECT,
        { id: USER_CM },
        { role: "platform_admin" }, // sidestep section-based permission
      ),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /sectionId/);
      return true;
    },
  );
});

test("uploadScore: 404 when explicit pieceId belongs to another project", async () => {
  const fixture = baseFixture();
  fixture.pieces.push({
    id: "piece-foreign",
    project_id: "another-project",
    title: "Other",
    sort_order: 1,
  });
  fake.reset(fixture);
  await assert.rejects(
    () =>
      scoreService.uploadScore(
        {
          sectionId: SECTION_A,
          title: "x",
          pieceId: "piece-foreign",
          xmlContent: "<x/>",
        },
        PROJECT,
        { id: USER_CM },
        membershipCM,
      ),
    (err) => {
      assert.equal(err.statusCode, 404);
      return true;
    },
  );
});

test("uploadScore: 409 when uploading twice for the same (piece, section)", async () => {
  fake.reset(baseFixture());

  await scoreService.uploadScore(baseBody(), PROJECT, { id: USER_CM }, membershipCM);

  await assert.rejects(
    () =>
      scoreService.uploadScore(
        baseBody({ title: "duplicate upload" }),
        PROJECT,
        { id: USER_CM },
        membershipCM,
      ),
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.match(err.message, /piece and section/i);
      return true;
    },
  );
});

test("uploadScore: pieces sort_order increments on second piece", async () => {
  fake.reset(baseFixture());
  await scoreService.uploadScore(baseBody(), PROJECT, { id: USER_CM }, membershipCM);
  await scoreService.uploadScore(
    baseBody({
      sectionId: SECTION_B,
      title: "V2 — Brahms",
      piece: { title: "Brahms 1" },
    }),
    PROJECT,
    { id: USER_CM },
    membershipCM,
  );
  const pieces = fake.rows("pieces").sort((a, b) => a.sort_order - b.sort_order);
  assert.deepEqual(
    pieces.map((p) => [p.title, p.sort_order]),
    [
      ["Symphony No. 5", 1],
      ["Brahms 1", 2],
    ],
  );
});
