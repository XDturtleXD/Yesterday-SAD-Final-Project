// HTTP-level integration tests for
// POST /api/projects/:projectId/pieces/:pieceId/bowing-suggestions/scan

require("../helpers/testEnv");
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFakeSupabase } = require("../helpers/fakeSupabase");
const { injectFakeSupabase, startHarness } = require("../helpers/httpHarness");
const {
  seedSections,
  seedUserWithToken,
  SECTION_FIRST_VIOLIN,
  SECTION_VIOLA,
} = require("../helpers/fixtures");

const fake = createFakeSupabase();
injectFakeSupabase(fake);
const app = require("../../src/app");
const harness = startHarness(app);

test.after(async () => {
  await harness.stop();
});

const now = () => new Date().toISOString();

const setupScenario = async () => {
  fake.reset({});
  seedSections(fake);
  const owner = seedUserWithToken(fake, { email: "owner@example.test", name: "Owner" });
  const created = await harness.request("POST", "/api/projects", {
    token: owner.token,
    body: { name: "Orchestra", sectionId: SECTION_FIRST_VIOLIN },
  });
  return { owner, projectId: created.body.data.id };
};

const seedMember = (projectId, user, sectionId, role = "member") => {
  fake.seedRows("project_members", [
    {
      id: `pm-${user.user.id}-${sectionId}`,
      project_id: projectId,
      user_id: user.user.id,
      section_id: sectionId,
      role,
      created_at: now(),
      updated_at: now(),
    },
  ]);
};

const parsePitch = (pitch) => {
  const match = String(pitch).match(/^([A-G])(\d+)?$/);
  return {
    step: match ? match[1] : pitch,
    octave: match && match[2] ? match[2] : "4",
  };
};

const plainNote = (pitch) => {
  const p = parsePitch(pitch);
  return `
    <note>
      <pitch><step>${p.step}</step><octave>${p.octave}</octave></pitch>
      <duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff>
    </note>`;
};

// variant: "user" = data-user-bowing (editor-added shared bowing)
//          "plain" = no attrs (original/OCR bowing — should NOT generate suggestions)
const bowedNote = (pitch, bowType, variant = "user") => {
  const p = parsePitch(pitch);
  const attr =
    variant === "user"
      ? ` data-user-bowing="true" data-bowing-layer="shared"`
      : "";
  return `
    <note>
      <pitch><step>${p.step}</step><octave>${p.octave}</octave></pitch>
      <duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff>
      <notations><technical><${bowType}${attr}/></technical></notations>
    </note>`;
};

const scoreXml = (notes) => `<?xml version="1.0"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Part</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      ${notes.join("")}
    </measure>
    <measure number="2">
      ${notes.join("")}
    </measure>
  </part>
</score-partwise>`;

const MELODY = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"];
const MELODY_TRANSPOSED = ["G4", "A4", "B4", "C5", "D5", "E5", "F5", "G5"];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("POST /bowing-suggestions/scan: returns 401 without auth", async () => {
  const { projectId } = await setupScenario();
  const { status } = await harness.request(
    "POST",
    `/api/projects/${projectId}/pieces/any-piece/bowing-suggestions/scan`,
    {},
  );
  assert.equal(status, 401);
});

test("POST /bowing-suggestions/scan: returns empty suggestions when fewer than 2 scores", async () => {
  const { owner, projectId } = await setupScenario();
  const upload = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_FIRST_VIOLIN,
      title: "Only Score",
      piece: { title: "Solo Piece" },
      xmlContent: scoreXml(MELODY.map(plainNote)),
    },
  });
  assert.equal(upload.status, 201);
  const pieceId = upload.body.data.piece_id;

  const { status, body } = await harness.request(
    "POST",
    `/api/projects/${projectId}/pieces/${pieceId}/bowing-suggestions/scan`,
    { token: owner.token, body: {} },
  );
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.deepEqual(body.data.suggestions, []);
});

test("POST /bowing-suggestions/scan: returns empty when no bowing marks in source", async () => {
  const { owner, projectId } = await setupScenario();
  const first = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_FIRST_VIOLIN,
      title: "Violin I",
      piece: { title: "Piece A" },
      xmlContent: scoreXml(MELODY.map(plainNote)),
    },
  });
  assert.equal(first.status, 201);
  await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_VIOLA,
      title: "Viola",
      pieceId: first.body.data.piece_id,
      xmlContent: scoreXml(MELODY.map(plainNote)),
    },
  });

  const { status, body } = await harness.request(
    "POST",
    `/api/projects/${projectId}/pieces/${first.body.data.piece_id}/bowing-suggestions/scan`,
    { token: owner.token, body: { threshold: 0.95, windowSizes: [8] } },
  );
  assert.equal(status, 200);
  assert.deepEqual(body.data.suggestions, []);
});

test("POST /bowing-suggestions/scan: returns up-bow suggestion for similar passage", async () => {
  const { owner, projectId } = await setupScenario();

  const sourceNotes = MELODY.map((p, i) => i === 0 ? bowedNote(p, "up-bow") : plainNote(p));
  const targetNotes = MELODY_TRANSPOSED.map(plainNote);

  const source = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_FIRST_VIOLIN,
      title: "Violin I",
      piece: { title: "Bowing Piece" },
      xmlContent: scoreXml(sourceNotes),
    },
  });
  assert.equal(source.status, 201);
  const target = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_VIOLA,
      title: "Viola",
      pieceId: source.body.data.piece_id,
      xmlContent: scoreXml(targetNotes),
    },
  });
  assert.equal(target.status, 201);

  const { status, body } = await harness.request(
    "POST",
    `/api/projects/${projectId}/pieces/${source.body.data.piece_id}/bowing-suggestions/scan`,
    { token: owner.token, body: { threshold: 0.95, windowSizes: [8] } },
  );
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.ok(body.data.suggestions.length >= 1);
  const suggestion = body.data.suggestions.find((s) => s.bowingType === "up-bow");
  assert.ok(suggestion, "expected an up-bow suggestion");
  assert.equal(suggestion.sourceScoreId, source.body.data.id);
  assert.equal(suggestion.targetScoreId, target.body.data.id);
  assert.equal(typeof suggestion.targetRef.measureNumber, "number");
  assert.equal(typeof suggestion.targetRef.noteIndex, "number");
  assert.equal(suggestion.status, "pending");
});

test("POST /bowing-suggestions/scan: returns down-bow suggestion for similar passage", async () => {
  const { owner, projectId } = await setupScenario();

  const sourceNotes = MELODY.map((p, i) => i === 0 ? bowedNote(p, "down-bow") : plainNote(p));
  const targetNotes = MELODY_TRANSPOSED.map(plainNote);

  const source = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_FIRST_VIOLIN,
      title: "Violin I",
      piece: { title: "Down Bow Piece" },
      xmlContent: scoreXml(sourceNotes),
    },
  });
  assert.equal(source.status, 201);
  const target = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_VIOLA,
      title: "Viola",
      pieceId: source.body.data.piece_id,
      xmlContent: scoreXml(targetNotes),
    },
  });
  assert.equal(target.status, 201);

  const { status, body } = await harness.request(
    "POST",
    `/api/projects/${projectId}/pieces/${source.body.data.piece_id}/bowing-suggestions/scan`,
    { token: owner.token, body: { threshold: 0.95, windowSizes: [8] } },
  );
  assert.equal(status, 200);
  assert.ok(body.data.suggestions.length >= 1);
  const suggestion = body.data.suggestions.find((s) => s.bowingType === "down-bow");
  assert.ok(suggestion, "expected a down-bow suggestion");
  assert.equal(suggestion.targetScoreId, target.body.data.id);
});

test("POST /bowing-suggestions/scan: skips original/unmarked bowing marks (no data-user-bowing)", async () => {
  const { owner, projectId } = await setupScenario();

  const sourceNotes = MELODY.map((p, i) => i === 0 ? bowedNote(p, "up-bow", "plain") : plainNote(p));
  const targetNotes = MELODY_TRANSPOSED.map(plainNote);

  const source = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_FIRST_VIOLIN,
      title: "Violin I",
      piece: { title: "Suggestion Only Piece" },
      xmlContent: scoreXml(sourceNotes),
    },
  });
  assert.equal(source.status, 201);
  await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_VIOLA,
      title: "Viola",
      pieceId: source.body.data.piece_id,
      xmlContent: scoreXml(targetNotes),
    },
  });

  const { status, body } = await harness.request(
    "POST",
    `/api/projects/${projectId}/pieces/${source.body.data.piece_id}/bowing-suggestions/scan`,
    { token: owner.token, body: { threshold: 0.95, windowSizes: [8] } },
  );
  assert.equal(status, 200);
  assert.deepEqual(body.data.suggestions, []);
});

test("POST /bowing-suggestions/scan: member sees cross-section suggestions (broad access)", async () => {
  const { owner, projectId } = await setupScenario();

  const sourceNotes = MELODY.map((p, i) => i === 0 ? bowedNote(p, "up-bow") : plainNote(p));
  const targetNotes = MELODY_TRANSPOSED.map(plainNote);

  const violaScore = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_VIOLA,
      title: "Viola",
      piece: { title: "Cross Section Piece" },
      xmlContent: scoreXml(sourceNotes),
    },
  });
  assert.equal(violaScore.status, 201);
  const vln1Score = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_FIRST_VIOLIN,
      title: "Violin I",
      pieceId: violaScore.body.data.piece_id,
      xmlContent: scoreXml(targetNotes),
    },
  });
  assert.equal(vln1Score.status, 201);

  const member = seedUserWithToken(fake, { email: "member-bowing@example.test" });
  seedMember(projectId, member, SECTION_FIRST_VIOLIN, "member");

  const { status, body } = await harness.request(
    "POST",
    `/api/projects/${projectId}/pieces/${violaScore.body.data.piece_id}/bowing-suggestions/scan`,
    { token: member.token, body: { threshold: 0.95, windowSizes: [8] } },
  );
  assert.equal(status, 200);
  assert.ok(body.data.suggestions.length >= 1, "member should see cross-section bowing suggestions");
});
