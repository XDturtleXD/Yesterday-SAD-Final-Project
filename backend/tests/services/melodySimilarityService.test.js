require("../helpers/testEnv");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  _helpers,
} = require("../../src/services/melodySimilarityService");

const musicXml = (notes) => `<?xml version="1.0"?>
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
      ${notes.join("\n")}
    </measure>
  </part>
</score-partwise>`;

const parsePitch = (pitch, fallbackOctave = 4) => {
  if (typeof pitch === "object") return pitch;
  const match = String(pitch).match(/^([A-G])(\d+)?$/);
  return {
    step: match ? match[1] : pitch,
    octave: match && match[2] ? Number(match[2]) : fallbackOctave,
  };
};

const note = (pitch, fallbackOctave = 4, duration = 1) => {
  const parsed = parsePitch(pitch, fallbackOctave);
  return `
  <note>
    <pitch><step>${parsed.step}</step><octave>${parsed.octave}</octave></pitch>
    <duration>${duration}</duration>
    <voice>1</voice>
    <type>quarter</type>
    <staff>1</staff>
  </note>`;
};

const rest = (duration = 1) => `
  <note>
    <rest/>
    <duration>${duration}</duration>
    <voice>1</voice>
    <type>quarter</type>
    <staff>1</staff>
  </note>`;

const segment = (pitches, octave = 4, durations = []) =>
  _helpers.extractPitchedNotes(
    musicXml(pitches.map((pitch, index) => note(pitch, octave, durations[index] || 1))),
    "score-a",
  );

test("identical melody but transposed scores high", () => {
  const source = segment(["C4", "D4", "E4", "F4"]);
  const target = segment(["G4", "A4", "B4", "C5"]);

  const score = _helpers.scoreSegments(source, target);
  assert.equal(score.intervalScore, 1);
  assert.equal(score.rhythmScore, 1);
  assert.equal(score.similarity, 1);
});

test("same contour in a different octave scores high", () => {
  const source = segment(["C", "D", "E", "G"], 4);
  const target = segment(["C", "D", "E", "G"], 5);

  const score = _helpers.scoreSegments(source, target);
  assert.equal(score.similarity, 1);
});

test("unrelated melody scores low", () => {
  const source = segment(["C", "D", "E", "G"]);
  const target = segment(["G", "E", "D", "C"]);

  const score = _helpers.scoreSegments(source, target);
  assert.ok(score.similarity < 0.5);
});

test("rhythm mismatch lowers score but does not crash", () => {
  const source = segment(["C4", "D4", "E4", "F4"], 4, [1, 1, 1, 1]);
  const target = segment(["G4", "A4", "B4", "C5"], 4, [1, 2, 1, 4]);

  const score = _helpers.scoreSegments(source, target);
  assert.equal(score.intervalScore, 1);
  assert.ok(score.rhythmScore < 1);
  assert.ok(score.similarity < 1);
  assert.ok(score.similarity > 0.7);
});

test("rests are ignored during note extraction", () => {
  const notes = _helpers.extractPitchedNotes(
    musicXml([note("C", 4), rest(), note("D", 4), rest(2), note("E", 4)]),
    "score-a",
  );

  assert.equal(notes.length, 3);
  assert.deepEqual(notes.map((n) => n.step), ["C", "D", "E"]);
});

test("too short source range returns useful error", () => {
  const notes = segment(["C", "D", "E"]);

  assert.throws(
    () =>
      _helpers.extractRange(notes, {
        startRef: { scoreId: "score-a", partId: "P1", measureArrayIndex: 0, noteIndex: 0 },
        endRef: { scoreId: "score-a", partId: "P1", measureArrayIndex: 0, noteIndex: 2 },
      }),
    /Source range is too short/,
  );
});

test("findSimilarInScore returns top-level candidate refs and measure range", () => {
  const source = segment(["C", "D", "E", "G"]);
  const targetScore = {
    id: "target-score",
    section_id: "section-b",
    section_name: "Violin II",
    xml_content: musicXml([
      note("G", 4),
      note("A", 4),
      note("B", 4),
      note("D", 5),
      note("C", 4),
    ]),
  };

  const candidates = _helpers.findSimilarInScore(source, targetScore, { threshold: 0.9 });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].targetScoreId, "target-score");
  assert.equal(candidates[0].startMeasureNumber, 1);
  assert.equal(candidates[0].endMeasureNumber, 1);
  assert.equal(candidates[0].noteCount, 4);
});
