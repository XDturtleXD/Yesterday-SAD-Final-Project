// Edge-case coverage for scoreService.uploadScore that didn't fit cleanly
// into the original integration test file (round-tripping of optional fields,
// fileType variants, storage_bucket overrides, etc.).

require("../helpers/testEnv");
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFakeSupabase } = require("../helpers/fakeSupabase");

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
const USER_CM = "22222222-2222-2222-2222-222222222001";

const membershipCM = { role: "concertmaster", section_id: SECTION_A };

const seedSection = () => {
  fake.reset({
    sections: [{ id: SECTION_A, code: "second_violin", name: "Violin II", sort_order: 2 }],
  });
};

test("uploadScore: normalizes MusicXML metadata before persisting xml_content", async () => {
  seedSection();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work>
    <work-title>Music21 Fragment</work-title>
  </work>
  <movement-title>Music21 Fragment</movement-title>
  <identification>
    <creator type="composer">Music21</creator>
  </identification>
  <credit page="1">
    <credit-type>title</credit-type>
    <credit-words>Music21 Fragment</credit-words>
  </credit>
  <credit page="1">
    <credit-type>composer</credit-type>
    <credit-words>Music21</credit-words>
  </credit>
  <part-list>
    <score-part id="P1">
      <part-name>Voice</part-name>
      <score-instrument id="P1-I1">
        <instrument-name>Voice</instrument-name>
      </score-instrument>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <note><rest/><duration>1</duration></note>
    </measure>
  </part>
</score-partwise>`;
  const score = await scoreService.uploadScore(
    {
      sectionId: SECTION_A,
      title: "String Quartet - Second Violin",
      piece: { title: "String Quartet", composer: "Haydn" },
      xmlContent: xml,
    },
    PROJECT,
    { id: USER_CM },
    membershipCM,
  );
  assert.match(score.xml_content, /<work-title>String Quartet - Second Violin<\/work-title>/);
  assert.match(score.xml_content, /<movement-title>String Quartet - Second Violin<\/movement-title>/);
  assert.match(score.xml_content, /<credit-words[^>]*>String Quartet - Second Violin<\/credit-words>/);
  assert.match(score.xml_content, /<creator type="composer">Haydn<\/creator>/);
  assert.match(score.xml_content, /<credit-words[^>]*>Haydn<\/credit-words>/);
  assert.match(score.xml_content, /<part-name>Violin II<\/part-name>/);
  assert.match(score.xml_content, /<instrument-name>Violin II<\/instrument-name>/);
  assert.doesNotMatch(score.xml_content, /Music21 Fragment/);
  assert.doesNotMatch(score.xml_content, />Music21</);
  assert.doesNotMatch(score.xml_content, />Voice</);
  assert.match(score.xml_content, /<note><rest\/><duration>1<\/duration><\/note>/);
});

test("uploadScore: storage_bucket override is preserved", async () => {
  seedSection();
  const score = await scoreService.uploadScore(
    {
      sectionId: SECTION_A,
      title: "Vln 1 — A",
      piece: { title: "Piece A" },
      storagePath: "alt/path/score.musicxml",
      storageBucket: "alt-bucket",
    },
    PROJECT,
    { id: USER_CM },
    membershipCM,
  );
  assert.equal(score.storage_bucket, "alt-bucket");
  assert.equal(score.storage_path, "alt/path/score.musicxml");
});

test("uploadScore: fileType 'mxl' synthesises an .mxl storage_path", async () => {
  seedSection();
  const score = await scoreService.uploadScore(
    {
      sectionId: SECTION_A,
      title: "Vln 1 — A",
      piece: { title: "Piece A" },
      xmlContent: "<binary-placeholder/>",
      fileType: "mxl",
    },
    PROJECT,
    { id: USER_CM },
    membershipCM,
  );
  assert.equal(score.file_type, "mxl");
  assert.match(score.storage_path, /\.mxl$/);
});

test("uploadScore: fileType 'xml' is accepted and stored", async () => {
  seedSection();
  const score = await scoreService.uploadScore(
    {
      sectionId: SECTION_A,
      title: "Vln 1 — A",
      piece: { title: "Piece A" },
      xmlContent: "<root/>",
      fileType: "xml",
    },
    PROJECT,
    { id: USER_CM },
    membershipCM,
  );
  assert.equal(score.file_type, "xml");
});

test("uploadScore: file_size_bytes is preserved", async () => {
  seedSection();
  const score = await scoreService.uploadScore(
    {
      sectionId: SECTION_A,
      title: "Vln 1 — A",
      piece: { title: "Piece A" },
      xmlContent: "<root/>",
      fileSizeBytes: 123456,
    },
    PROJECT,
    { id: USER_CM },
    membershipCM,
  );
  assert.equal(score.file_size_bytes, 123456);
});

test("uploadScore: negative file_size_bytes is silently normalized to null", async () => {
  // normalizeUploadPayload accepts numbers >= 0; anything else (including
  // negative) becomes null instead of throwing — service-level NOT NULL is
  // not required.
  seedSection();
  const score = await scoreService.uploadScore(
    {
      sectionId: SECTION_A,
      title: "Vln 1 — A",
      piece: { title: "Piece A" },
      xmlContent: "<root/>",
      fileSizeBytes: -5,
    },
    PROJECT,
    { id: USER_CM },
    membershipCM,
  );
  assert.equal(score.file_size_bytes, null);
});

test("uploadScore: composer defaults to null when piece.composer omitted", async () => {
  seedSection();
  await scoreService.uploadScore(
    {
      sectionId: SECTION_A,
      title: "Vln 1 — A",
      piece: { title: "Piece A" },
      xmlContent: "<root/>",
    },
    PROJECT,
    { id: USER_CM },
    membershipCM,
  );
  const pieces = fake.rows("pieces");
  assert.equal(pieces[0].composer, null);
});

test("uploadScore: composer whitespace-only is normalized to null", async () => {
  seedSection();
  await scoreService.uploadScore(
    {
      sectionId: SECTION_A,
      title: "Vln 1 — A",
      piece: { title: "Piece A", composer: "   " },
      xmlContent: "<root/>",
    },
    PROJECT,
    { id: USER_CM },
    membershipCM,
  );
  const pieces = fake.rows("pieces");
  assert.equal(pieces[0].composer, null);
});

test("uploadScore: created_by is the requesting user", async () => {
  seedSection();
  const score = await scoreService.uploadScore(
    {
      sectionId: SECTION_A,
      title: "Vln 1 — A",
      piece: { title: "Piece A" },
      xmlContent: "<root/>",
    },
    PROJECT,
    { id: "AUTHOR-1" },
    membershipCM,
  );
  assert.equal(score.created_by, "AUTHOR-1");
});

test("uploadScore: empty-string xmlContent treated as missing (400)", async () => {
  seedSection();
  await assert.rejects(
    () =>
      scoreService.uploadScore(
        {
          sectionId: SECTION_A,
          title: "Vln 1 — A",
          piece: { title: "Piece A" },
          xmlContent: "   ",
        },
        PROJECT,
        { id: USER_CM },
        membershipCM,
      ),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /xmlContent or storagePath/);
      return true;
    },
  );
});

test("uploadScore: missing membership context yields 403", async () => {
  seedSection();
  await assert.rejects(
    () =>
      scoreService.uploadScore(
        {
          sectionId: SECTION_A,
          title: "Vln 1 — A",
          piece: { title: "Piece A" },
          xmlContent: "<root/>",
        },
        PROJECT,
        { id: USER_CM },
        null,
      ),
    (err) => {
      assert.equal(err.statusCode, 403);
      return true;
    },
  );
});
