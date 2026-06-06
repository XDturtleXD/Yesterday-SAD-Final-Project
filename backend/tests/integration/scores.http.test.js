// HTTP-level integration tests for /api/projects/:projectId/scores and
// /api/scores/:scoreId. Exercises auth → project permission → upload.

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
  SECTION_VIOLA,
} = require("../helpers/fixtures");

const fake = createFakeSupabase();
injectFakeSupabase(fake);
const app = require("../../src/app");
const harness = startHarness(app);

test.after(async () => {
  await harness.stop();
});

const setupScenario = async ({ ownerSection = SECTION_FIRST_VIOLIN } = {}) => {
  fake.reset({});
  seedSections(fake);
  const owner = seedUserWithToken(fake, { email: "owner@example.test", name: "Owner" });
  // Owner creates a project (becomes concertmaster).
  const created = await harness.request("POST", "/api/projects", {
    token: owner.token,
    body: { name: "Concert", sectionId: ownerSection },
  });
  return { owner, projectId: created.body.data.id };
};

const now = () => new Date().toISOString();

const seedMember = (projectId, user, sectionId, role = "member") => {
  fake.seedRows("project_members", [
    {
      id: `pm-${user.user.id}-${role}-${sectionId}`,
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

const melodyXml = (pitches, durations = []) => `<?xml version="1.0"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Part</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      ${pitches.map((pitch, index) => {
        const parsed = parsePitch(pitch);
        return `
        <note>
          <pitch><step>${parsed.step}</step><octave>${parsed.octave}</octave></pitch>
          <duration>${durations[index] || 1}</duration>
          <voice>1</voice>
          <type>quarter</type>
          <staff>1</staff>
        </note>
      `;
      }).join("\n")}
    </measure>
  </part>
</score-partwise>`;

const sourceRange = (scoreId) => ({
  startRef: {
    scoreId,
    partId: "P1",
    measureArrayIndex: 0,
    noteIndex: 0,
    staff: "1",
    voice: "1",
  },
  endRef: {
    scoreId,
    partId: "P1",
    measureArrayIndex: 0,
    noteIndex: 3,
    staff: "1",
    voice: "1",
  },
});

// ---------------------------------------------------------------------------
// Upload happy path
// ---------------------------------------------------------------------------

test("POST /scores: concertmaster uploads and gets 201 + score row", async () => {
  const { owner, projectId } = await setupScenario();
  const { status, body } = await harness.request(
    "POST",
    `/api/projects/${projectId}/scores`,
    {
      token: owner.token,
      body: {
        sectionId: SECTION_FIRST_VIOLIN,
        title: "Vln 1 — Beethoven 5",
        piece: { title: "Symphony 5", composer: "Beethoven" },
        xmlContent: '<?xml version="1.0"?><score-partwise/>',
      },
    },
  );
  assert.equal(status, 201);
  assert.equal(body.success, true);
  assert.equal(body.data.project_id, projectId);
  assert.equal(body.data.section_id, SECTION_FIRST_VIOLIN);
  assert.equal(body.data.title, "Vln 1 — Beethoven 5");
  assert.equal(body.data.file_type, "musicxml");
  assert.ok(body.data.id);
});

test("POST /scores/upload: concertmaster uploads a MusicXML file", async () => {
  const { owner, projectId } = await setupScenario();
  const baseURL = await harness.baseURLPromise;
  const form = new FormData();
  form.set(
    "file",
    new Blob(['<?xml version="1.0"?><score-partwise version="4.0"></score-partwise>'], {
      type: "application/vnd.recordare.musicxml+xml",
    }),
    "violin.musicxml",
  );
  form.set("sectionId", SECTION_FIRST_VIOLIN);
  form.set("title", "Violin I");
  form.set("pieceTitle", "Test Piece");

  const res = await fetch(`${baseURL}/api/projects/${projectId}/scores/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${owner.token}` },
    body: form,
  });
  const body = await res.json();

  assert.equal(res.status, 201);
  assert.equal(body.success, true);
  assert.equal(body.data.project_id, projectId);
  assert.equal(body.data.original_filename, "violin.musicxml");
  assert.equal(body.data.file_type, "musicxml");
});

test("POST /scores/upload: concertmaster uploads an MXL file", async () => {
  const JSZip = require("jszip");
  const { owner, projectId } = await setupScenario();
  const baseURL = await harness.baseURLPromise;
  const zip = new JSZip();
  zip.file(
    "score.musicxml",
    '<?xml version="1.0"?><score-partwise version="4.0"></score-partwise>',
  );
  const mxlBuffer = await zip.generateAsync({ type: "nodebuffer" });

  const form = new FormData();
  form.set(
    "file",
    new Blob([mxlBuffer], { type: "application/vnd.recordare.musicxml" }),
    "violin.mxl",
  );
  form.set("sectionId", SECTION_FIRST_VIOLIN);
  form.set("title", "Violin I MXL");
  form.set("pieceTitle", "Test Piece");

  const res = await fetch(`${baseURL}/api/projects/${projectId}/scores/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${owner.token}` },
    body: form,
  });
  const body = await res.json();

  assert.equal(res.status, 201);
  assert.equal(body.success, true);
  assert.equal(body.data.original_filename, "violin.mxl");
  assert.equal(body.data.file_type, "mxl");
});

test("POST /scores/upload: rejects non-MusicXML XML content", async () => {
  const { owner, projectId } = await setupScenario();
  const baseURL = await harness.baseURLPromise;
  const form = new FormData();
  form.set("file", new Blob(["<not-music></not-music>"], { type: "application/xml" }), "bad.xml");
  form.set("sectionId", SECTION_FIRST_VIOLIN);
  form.set("title", "Bad");
  form.set("pieceTitle", "Bad Piece");

  const res = await fetch(`${baseURL}/api/projects/${projectId}/scores/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${owner.token}` },
    body: form,
  });
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.match(body.message, /MusicXML/);
});

test("POST /scores/upload: PDF upload starts a conversion job", async () => {
  const { owner, projectId } = await setupScenario();
  const baseURL = await harness.baseURLPromise;
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    const target = String(url);
    if (!target.startsWith(baseURL) && target.endsWith("/upload") && options?.method === "POST") {
      return new Response(JSON.stringify({ job_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(url, options);
  };

  try {
    const form = new FormData();
    form.set("file", new Blob(["%PDF-1.7"], { type: "application/pdf" }), "part.pdf");
    form.set("sectionId", SECTION_FIRST_VIOLIN);
    form.set("title", "Violin I");
    form.set("pieceTitle", "PDF Piece");

    const res = await fetch(`${baseURL}/api/projects/${projectId}/scores/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${owner.token}` },
      body: form,
    });
    const body = await res.json();

    assert.equal(res.status, 202);
    assert.equal(body.success, true);
    assert.equal(body.data.jobId, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    assert.equal(body.data.status, "queued");
  } finally {
    global.fetch = originalFetch;
  }
});

test("POST /scores/upload: reports a clear error when OMR service is unavailable", async () => {
  const { owner, projectId } = await setupScenario();
  const baseURL = await harness.baseURLPromise;
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    const target = String(url);
    if (!target.startsWith(baseURL) && target.endsWith("/upload") && options?.method === "POST") {
      throw new TypeError("fetch failed");
    }
    return originalFetch(url, options);
  };

  try {
    const form = new FormData();
    form.set("file", new Blob(["%PDF-1.7"], { type: "application/pdf" }), "part.pdf");
    form.set("sectionId", SECTION_FIRST_VIOLIN);
    form.set("title", "Violin I");
    form.set("pieceTitle", "PDF Piece");

    const res = await fetch(`${baseURL}/api/projects/${projectId}/scores/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${owner.token}` },
      body: form,
    });
    const body = await res.json();

    assert.equal(res.status, 502);
    assert.equal(body.success, false);
    assert.match(body.message, /Conversion service is unavailable/);
    assert.match(body.message, /npm run dev:all/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("POST /scores: 401 without token", async () => {
  const { projectId } = await setupScenario();
  const { status } = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    body: {
      sectionId: SECTION_FIRST_VIOLIN,
      title: "x",
      piece: { title: "y" },
      xmlContent: "<x/>",
    },
  });
  assert.equal(status, 401);
});

test("POST /scores: 403 when not a project member", async () => {
  const { projectId } = await setupScenario();
  const stranger = seedUserWithToken(fake, { email: "stranger@example.test" });
  const { status } = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: stranger.token,
    body: {
      sectionId: SECTION_FIRST_VIOLIN,
      title: "x",
      piece: { title: "y" },
      xmlContent: "<x/>",
    },
  });
  assert.equal(status, 403);
});

test("POST /scores: 400 when required fields missing", async () => {
  const { owner, projectId } = await setupScenario();
  const { status, body } = await harness.request(
    "POST",
    `/api/projects/${projectId}/scores`,
    {
      token: owner.token,
      body: { sectionId: SECTION_FIRST_VIOLIN, title: "x", xmlContent: "<x/>" },
      // no pieceId / piece
    },
  );
  assert.equal(status, 400);
  assert.match(body.message, /pieceId or piece\.title/);
});

test("POST /scores: 409 when uploading twice for same (piece, section)", async () => {
  const { owner, projectId } = await setupScenario();
  const baseBody = {
    sectionId: SECTION_FIRST_VIOLIN,
    title: "x",
    piece: { title: "Same piece" },
    xmlContent: "<x/>",
  };
  const first = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: baseBody,
  });
  assert.equal(first.status, 201);
  const second = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: { ...baseBody, title: "x2" },
  });
  assert.equal(second.status, 409);
});

test("POST /scores: principal can upload only to own section", async () => {
  const { projectId } = await setupScenario();
  // Add a principal for second violin via direct member seed.
  const principal = seedUserWithToken(fake, { email: "p@example.test" });
  fake.seedRows("project_members", [
    {
      id: "pm-principal",
      project_id: projectId,
      user_id: principal.user.id,
      section_id: SECTION_SECOND_VIOLIN,
      role: "principal",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);

  // Own section: OK.
  const ownSection = await harness.request(
    "POST",
    `/api/projects/${projectId}/scores`,
    {
      token: principal.token,
      body: {
        sectionId: SECTION_SECOND_VIOLIN,
        title: "Vln 2 — A",
        piece: { title: "Piece" },
        xmlContent: "<x/>",
      },
    },
  );
  assert.equal(ownSection.status, 201);

  // Other section: 403.
  const otherSection = await harness.request(
    "POST",
    `/api/projects/${projectId}/scores`,
    {
      token: principal.token,
      body: {
        sectionId: SECTION_FIRST_VIOLIN,
        title: "Vln 1 — A",
        piece: { title: "Piece" },
        xmlContent: "<x/>",
      },
    },
  );
  assert.equal(otherSection.status, 403);
});

test("POST /projects/:projectId/pieces/:pieceId/similar-passages/scan: returns piece-level visible highlights", async () => {
  const { owner, projectId } = await setupScenario();
  const first = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_SECOND_VIOLIN,
      title: "Violin II",
      piece: { title: "Global Similarity Piece" },
      xmlContent: melodyXml(["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"]),
    },
  });
  assert.equal(first.status, 201);

  const second = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_VIOLA,
      title: "Viola",
      pieceId: first.body.data.piece_id,
      xmlContent: melodyXml(["C5", "D5", "E5", "F5", "G5", "A5", "B5", "C6"]),
    },
  });
  assert.equal(second.status, 201);

  const { status, body } = await harness.request(
    "POST",
    `/api/projects/${projectId}/pieces/${first.body.data.piece_id}/similar-passages/scan`,
    {
      token: owner.token,
      body: { threshold: 0.95, windowSizes: [8], maxHighlights: 5 },
    },
  );

  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.highlights.length, 1);
  assert.equal(body.data.highlights[0].leftScoreId, first.body.data.id);
  assert.equal(body.data.highlights[0].rightScoreId, second.body.data.id);
  assert.equal(body.data.highlights[0].similarity, 1);
});

test("POST /projects/:projectId/pieces/:pieceId/similar-passages/scan: does not expose hidden target scores", async () => {
  const { owner, projectId } = await setupScenario();
  const first = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_FIRST_VIOLIN,
      title: "Violin I",
      piece: { title: "Visibility Piece" },
      xmlContent: melodyXml(["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"]),
    },
  });
  assert.equal(first.status, 201);

  const hidden = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_VIOLA,
      title: "Viola",
      pieceId: first.body.data.piece_id,
      xmlContent: melodyXml(["C5", "D5", "E5", "F5", "G5", "A5", "B5", "C6"]),
    },
  });
  assert.equal(hidden.status, 201);

  const member = seedUserWithToken(fake, { email: "member@example.test" });
  seedMember(projectId, member, SECTION_FIRST_VIOLIN, "member");

  const { status, body } = await harness.request(
    "POST",
    `/api/projects/${projectId}/pieces/${first.body.data.piece_id}/similar-passages/scan`,
    {
      token: member.token,
      body: { threshold: 0.95, windowSizes: [8], maxHighlights: 5 },
    },
  );

  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.deepEqual(body.data.highlights, []);
});

// ---------------------------------------------------------------------------
// List + read
// ---------------------------------------------------------------------------

test("GET /projects/:projectId/scores: returns uploaded scores", async () => {
  const { owner, projectId } = await setupScenario();
  await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_FIRST_VIOLIN,
      title: "Vln 1",
      piece: { title: "P" },
      xmlContent: "<x/>",
    },
  });
  await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_SECOND_VIOLIN,
      title: "Vln 2",
      piece: { title: "P" },
      xmlContent: "<x/>",
    },
  });
  const { status, body } = await harness.request(
    "GET",
    `/api/projects/${projectId}/scores`,
    { token: owner.token },
  );
  assert.equal(status, 200);
  assert.equal(body.data.length, 2);
  const titles = body.data.map((s) => s.title).sort();
  assert.deepEqual(titles, ["Vln 1", "Vln 2"]);
});

test("GET /projects/:projectId/scores: principal sees every section score", async () => {
  const { owner, projectId } = await setupScenario();
  const principal = seedUserWithToken(fake, { email: "score-list-principal@example.test" });
  seedMember(projectId, principal, SECTION_SECOND_VIOLIN, "principal");

  await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_FIRST_VIOLIN,
      title: "Vln 1",
      piece: { title: "Principal visible piece" },
      xmlContent: "<x/>",
    },
  });
  await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_SECOND_VIOLIN,
      title: "Vln 2",
      piece: { title: "Principal visible piece" },
      xmlContent: "<x/>",
    },
  });

  const { status, body } = await harness.request(
    "GET",
    `/api/projects/${projectId}/scores`,
    { token: principal.token },
  );

  assert.equal(status, 200);
  assert.equal(body.data.length, 2);
  assert.deepEqual(body.data.map((s) => s.title).sort(), ["Vln 1", "Vln 2"]);
});

test("GET /projects/:projectId/scores: member sees every section score", async () => {
  const { owner, projectId } = await setupScenario();
  const member = seedUserWithToken(fake, { email: "score-list-member@example.test" });
  seedMember(projectId, member, SECTION_SECOND_VIOLIN, "member");

  await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_FIRST_VIOLIN,
      title: "Vln 1",
      piece: { title: "Member visible piece" },
      xmlContent: "<x/>",
    },
  });
  await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_SECOND_VIOLIN,
      title: "Vln 2",
      piece: { title: "Member visible piece" },
      xmlContent: "<x/>",
    },
  });

  const { status, body } = await harness.request(
    "GET",
    `/api/projects/${projectId}/scores`,
    { token: member.token },
  );

  assert.equal(status, 200);
  assert.equal(body.data.length, 2);
  assert.deepEqual(body.data.map((s) => s.title).sort(), ["Vln 1", "Vln 2"]);
});

test("POST /scores/:scoreId/similar-passages returns visible top candidates", async () => {
  const { owner, projectId } = await setupScenario();
  const source = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_FIRST_VIOLIN,
      title: "Violin I",
      piece: { title: "Similarity Piece" },
      xmlContent: melodyXml(["C4", "D4", "E4", "F4"]),
    },
  });
  const pieceId = source.body.data.piece_id;
  const target = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_SECOND_VIOLIN,
      title: "Violin II",
      pieceId,
      xmlContent: melodyXml(["G4", "A4", "B4", "C5"]),
    },
  });

  const response = await harness.request(
    "POST",
    `/api/scores/${source.body.data.id}/similar-passages`,
    {
      token: owner.token,
      body: {
        sourceRange: sourceRange(source.body.data.id),
        threshold: 0.9,
        limit: 5,
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.data.length, 1);
  assert.equal(response.body.data[0].targetScoreId, target.body.data.id);
  assert.equal(response.body.data[0].targetSectionId, SECTION_SECOND_VIOLIN);
  assert.equal(response.body.data[0].startMeasureNumber, 1);
  assert.equal(response.body.data[0].endMeasureNumber, 1);
  assert.equal(response.body.data[0].noteCount, 4);
  assert.ok(response.body.data[0].similarity >= 0.9);
});

test("POST /scores/:scoreId/similar-passages lets principals compare visible project scores", async () => {
  const { owner, projectId } = await setupScenario();
  const firstViolinPrincipal = seedUserWithToken(fake, {
    email: "similarity-principal@example.test",
    name: "Principal",
  });
  seedMember(projectId, firstViolinPrincipal, SECTION_FIRST_VIOLIN, "principal");

  const source = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_FIRST_VIOLIN,
      title: "Violin I",
      piece: { title: "Visibility Piece" },
      xmlContent: melodyXml(["C4", "D4", "E4", "F4"]),
    },
  });
  await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_SECOND_VIOLIN,
      title: "Violin II",
      pieceId: source.body.data.piece_id,
      xmlContent: melodyXml(["G4", "A4", "B4", "C5"]),
    },
  });

  const response = await harness.request(
    "POST",
    `/api/scores/${source.body.data.id}/similar-passages`,
    {
      token: firstViolinPrincipal.token,
      body: {
        sourceRange: sourceRange(source.body.data.id),
        threshold: 0.7,
        limit: 5,
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.data.length, 1);
});

test("DELETE /scores/:scoreId: concertmaster deletes a score", async () => {
  const { owner, projectId } = await setupScenario();
  const upload = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_FIRST_VIOLIN,
      title: "Delete me",
      piece: { title: "Disposable" },
      xmlContent: "<x/>",
    },
  });
  const scoreId = upload.body.data.id;

  const deleted = await harness.request("DELETE", `/api/scores/${scoreId}`, {
    token: owner.token,
  });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.data.id, scoreId);

  const refetch = await harness.request("GET", `/api/scores/${scoreId}`, {
    token: owner.token,
  });
  assert.equal(refetch.status, 404);
});

test("PATCH /scores/:scoreId/musicxml: concertmaster saves inline MusicXML", async () => {
  const { owner, projectId } = await setupScenario();
  const upload = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_FIRST_VIOLIN,
      title: "Save me",
      piece: { title: "Editable piece" },
      xmlContent: "<score-partwise><part/></score-partwise>",
    },
  });
  const scoreId = upload.body.data.id;
  const nextXml = "<score-partwise><part><measure number=\"1\"/></part></score-partwise>";

  const saved = await harness.request("PATCH", `/api/scores/${scoreId}/musicxml`, {
    token: owner.token,
    body: { xmlContent: nextXml },
  });

  assert.equal(saved.status, 200);
  assert.equal(saved.body.success, true);
  assert.equal(saved.body.data.id, scoreId);
  assert.equal(saved.body.data.xml_content, nextXml);

  const refetched = await harness.request("GET", `/api/scores/${scoreId}`, {
    token: owner.token,
  });
  assert.equal(refetched.status, 200);
  assert.equal(refetched.body.data.xml_content, nextXml);
});

test("PATCH /scores/:scoreId/musicxml: accepts large MusicXML payloads", async () => {
  const { owner, projectId } = await setupScenario();
  const upload = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_FIRST_VIOLIN,
      title: "Large save",
      piece: { title: "Large editable piece" },
      xmlContent: "<score-partwise><part/></score-partwise>",
    },
  });
  const scoreId = upload.body.data.id;
  const largeXml = `<score-partwise><part>${"<!-- large-save-payload -->".repeat(260000)}</part></score-partwise>`;

  const saved = await harness.request("PATCH", `/api/scores/${scoreId}/musicxml`, {
    token: owner.token,
    body: { xmlContent: largeXml },
  });

  assert.notEqual(saved.status, 413);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.data.xml_content.length, largeXml.length);
});

test("PATCH /scores/:scoreId/musicxml: 400 when xmlContent is missing", async () => {
  const { owner, projectId } = await setupScenario();
  const upload = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_FIRST_VIOLIN,
      title: "Missing payload",
      piece: { title: "Payload piece" },
      xmlContent: "<score-partwise/>",
    },
  });

  const response = await harness.request("PATCH", `/api/scores/${upload.body.data.id}/musicxml`, {
    token: owner.token,
    body: {},
  });

  assert.equal(response.status, 400);
  assert.match(response.body.message, /xmlContent/);
});

test("PATCH /scores/:scoreId/musicxml: principal can edit own section only", async () => {
  const { owner, projectId } = await setupScenario();
  const principal = seedUserWithToken(fake, { email: "edit-principal@example.test" });
  seedMember(projectId, principal, SECTION_SECOND_VIOLIN, "principal");

  const own = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_SECOND_VIOLIN,
      title: "Own section",
      piece: { title: "Edit principal piece" },
      xmlContent: "<score-partwise/>",
    },
  });
  const other = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_FIRST_VIOLIN,
      title: "Other section",
      piece: { title: "Edit principal piece" },
      xmlContent: "<score-partwise/>",
    },
  });

  const ownEdit = await harness.request("PATCH", `/api/scores/${own.body.data.id}/musicxml`, {
    token: principal.token,
    body: { xmlContent: "<score-partwise><part-list /></score-partwise>" },
  });
  assert.equal(ownEdit.status, 200);

  const otherEdit = await harness.request("PATCH", `/api/scores/${other.body.data.id}/musicxml`, {
    token: principal.token,
    body: { xmlContent: "<score-partwise><part-list /></score-partwise>" },
  });
  assert.equal(otherEdit.status, 403);
});

test("DELETE /scores/:scoreId: principal can delete own section only", async () => {
  const { owner, projectId } = await setupScenario();
  const principal = seedUserWithToken(fake, { email: "delete-principal@example.test" });
  fake.seedRows("project_members", [
    {
      id: "pm-delete-principal",
      project_id: projectId,
      user_id: principal.user.id,
      section_id: SECTION_SECOND_VIOLIN,
      role: "principal",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);

  const own = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_SECOND_VIOLIN,
      title: "Own section",
      piece: { title: "Delete principal piece" },
      xmlContent: "<x/>",
    },
  });
  const other = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_FIRST_VIOLIN,
      title: "Other section",
      piece: { title: "Delete principal piece" },
      xmlContent: "<x/>",
    },
  });

  const ownDelete = await harness.request("DELETE", `/api/scores/${own.body.data.id}`, {
    token: principal.token,
  });
  assert.equal(ownDelete.status, 200);

  const otherDelete = await harness.request("DELETE", `/api/scores/${other.body.data.id}`, {
    token: principal.token,
  });
  assert.equal(otherDelete.status, 403);
});

test("GET /scores/:scoreId: principal can read another section's score", async () => {
  const { owner, projectId } = await setupScenario();
  const upload = await harness.request(
    "POST",
    `/api/projects/${projectId}/scores`,
    {
      token: owner.token,
      body: {
        sectionId: SECTION_FIRST_VIOLIN,
        title: "Vln 1",
        piece: { title: "P" },
        xmlContent: "<x/>",
      },
    },
  );
  const scoreId = upload.body.data.id;

  // Principal in section 2 tries to read a section 1 score.
  const principal = seedUserWithToken(fake, { email: "p2@example.test" });
  fake.seedRows("project_members", [
    {
      id: "pm-principal-2",
      project_id: projectId,
      user_id: principal.user.id,
      section_id: SECTION_SECOND_VIOLIN,
      role: "principal",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);

  const { status, body } = await harness.request("GET", `/api/scores/${scoreId}`, {
    token: principal.token,
  });
  assert.equal(status, 200);
  assert.equal(body.data.id, scoreId);
});

test("GET /scores/:scoreId: member can read another section's score", async () => {
  const { owner, projectId } = await setupScenario();
  const upload = await harness.request(
    "POST",
    `/api/projects/${projectId}/scores`,
    {
      token: owner.token,
      body: {
        sectionId: SECTION_FIRST_VIOLIN,
        title: "Vln 1",
        piece: { title: "P" },
        xmlContent: "<x/>",
      },
    },
  );
  const scoreId = upload.body.data.id;

  const member = seedUserWithToken(fake, { email: "member-section-2@example.test" });
  fake.seedRows("project_members", [
    {
      id: "pm-member-2",
      project_id: projectId,
      user_id: member.user.id,
      section_id: SECTION_SECOND_VIOLIN,
      role: "member",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ]);

  const { status, body } = await harness.request("GET", `/api/scores/${scoreId}`, {
    token: member.token,
  });
  assert.equal(status, 200);
  assert.equal(body.data.id, scoreId);
});

// ---------------------------------------------------------------------------
// POST /scores/:scoreId/similar-passages/scan
// ---------------------------------------------------------------------------

test("POST /scores/:scoreId/similar-passages/scan returns highlights when similar score exists", async () => {
  const { owner, projectId } = await setupScenario();
  // 8-note ascending scale
  const scale8 = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"];
  const source = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_FIRST_VIOLIN,
      title: "Scan source",
      piece: { title: "Scan piece" },
      xmlContent: melodyXml(scale8),
    },
  });
  const pieceId = source.body.data.piece_id;
  // Target: same melody (different section/score) — guaranteed similarity = 1
  const scale8up5 = scale8;
  await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_SECOND_VIOLIN,
      title: "Scan target",
      pieceId,
      xmlContent: melodyXml(scale8up5),
    },
  });

  const response = await harness.request(
    "POST",
    `/api/scores/${source.body.data.id}/similar-passages/scan`,
    {
      token: owner.token,
      body: { threshold: 0.7, windowSizes: [8], maxHighlights: 5 },
    },
  );

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.data.highlights));
  assert.ok(response.body.data.highlights.length >= 1);
  const h = response.body.data.highlights[0];
  assert.ok(h.similarity >= 0.7);
  assert.equal(h.sourceScoreId, source.body.data.id);
  assert.ok(h.targetStartMeasureNumber >= 1);
});

test("POST /scores/:scoreId/similar-passages/scan returns empty when no other score in same piece", async () => {
  const { owner, projectId } = await setupScenario();
  const scale8 = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"];
  const source = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_FIRST_VIOLIN,
      title: "Lonely scan",
      piece: { title: "Solo piece" },
      xmlContent: melodyXml(scale8),
    },
  });

  const response = await harness.request(
    "POST",
    `/api/scores/${source.body.data.id}/similar-passages/scan`,
    {
      token: owner.token,
      body: { threshold: 0.78 },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data.highlights, []);
});

test("POST /scores/:scoreId/similar-passages/scan: 400 when score has no inline xml_content", async () => {
  const { owner, projectId } = await setupScenario();
  const upload = await harness.request("POST", `/api/projects/${projectId}/scores`, {
    token: owner.token,
    body: {
      sectionId: SECTION_FIRST_VIOLIN,
      title: "Storage only score",
      piece: { title: "No XML piece" },
      storagePath: "/scores/test.musicxml",
      storageBucket: "public",
      fileType: "musicxml",
    },
  });

  const response = await harness.request(
    "POST",
    `/api/scores/${upload.body.data.id}/similar-passages/scan`,
    {
      token: owner.token,
      body: {},
    },
  );

  assert.equal(response.status, 400);
  assert.ok(response.body.message.toLowerCase().includes("xml"));
});
