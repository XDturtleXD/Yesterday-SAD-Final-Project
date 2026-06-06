require("../helpers/testEnv");
const test = require("node:test");
const assert = require("node:assert/strict");

const { _helpers } = require("../../src/services/fullScoreService");
const dom = require("../../src/utils/musicXmlDom");

const { combineScoresIntoFullScore } = _helpers;

const singlePartScore = (partId, noteStep) => `<?xml version="1.0"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>Original</work-title></work>
  <defaults><scaling><millimeters>7</millimeters><tenths>40</tenths></scaling></defaults>
  <part-list>
    <score-part id="${partId}">
      <part-name>Whatever</part-name>
      <score-instrument id="${partId}-I1"><instrument-name>Violin</instrument-name></score-instrument>
    </score-part>
  </part-list>
  <part id="${partId}">
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><pitch><step>${noteStep}</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;

test("combineScoresIntoFullScore merges single-part scores into one multi-part score", () => {
  const { xml, parts } = combineScoresIntoFullScore(
    [
      { scoreId: "score-a", sectionId: "sec-1", sectionName: "First Violin", sectionCode: "first_violin", xml: singlePartScore("P1", "C") },
      { scoreId: "score-b", sectionId: "sec-2", sectionName: "Cello", sectionCode: "cello", xml: singlePartScore("P1", "G") },
    ],
    { workTitle: "Symphony" },
  );

  // Parts mapping: stable order, unique re-id'd part ids.
  assert.equal(parts.length, 2);
  assert.deepEqual(
    parts.map((p) => ({ scoreId: p.scoreId, partId: p.partId, partIndex: p.partIndex })),
    [
      { scoreId: "score-a", partId: "P1", partIndex: 0 },
      { scoreId: "score-b", partId: "P2", partIndex: 1 },
    ],
  );

  const root = dom.parse(xml);
  const scorePartwise = root.children.find((c) => c.name === "score-partwise");
  const partList = dom.findChild(scorePartwise, "part-list");
  const scoreParts = dom.findChildren(partList, "score-part");
  const partElements = dom.findChildren(scorePartwise, "part");

  // Two parts, ids unique, score-part ids match part ids.
  assert.equal(scoreParts.length, 2);
  assert.equal(partElements.length, 2);
  assert.deepEqual(scoreParts.map((sp) => sp.attrs.id), ["P1", "P2"]);
  assert.deepEqual(partElements.map((p) => p.attrs.id), ["P1", "P2"]);

  // Each part is named after its section.
  const partNames = scoreParts.map((sp) => {
    const nameEl = dom.findChild(sp, "part-name");
    return nameEl.children.map((c) => c.text).join("");
  });
  assert.deepEqual(partNames, ["First Violin", "Cello"]);

  // Instrument ids were re-prefixed alongside their part (no P1-I1 collision).
  const instrumentIds = scoreParts.map((sp) => dom.findChild(sp, "score-instrument").attrs.id);
  assert.deepEqual(instrumentIds, ["P1-I1", "P2-I1"]);

  // Work title comes from the piece, not the donor score.
  const workTitle = dom.findChild(dom.findChild(scorePartwise, "work"), "work-title");
  assert.equal(workTitle.children.map((c) => c.text).join(""), "Symphony");
});

test("combineScoresIntoFullScore skips unparseable scores but keeps the rest", () => {
  const { parts } = combineScoresIntoFullScore(
    [
      { scoreId: "broken", sectionId: "sec-1", sectionName: "Viola", xml: "not xml at all" },
      { scoreId: "ok", sectionId: "sec-2", sectionName: "Cello", xml: singlePartScore("P1", "G") },
    ],
    { workTitle: "Piece" },
  );

  assert.equal(parts.length, 1);
  assert.equal(parts[0].scoreId, "ok");
  assert.equal(parts[0].partId, "P1");
});

test("combineScoresIntoFullScore throws when nothing combinable is provided", () => {
  assert.throws(
    () => combineScoresIntoFullScore([{ scoreId: "x", xml: "garbage" }], { workTitle: "P" }),
    /No combinable MusicXML parts/,
  );
});
