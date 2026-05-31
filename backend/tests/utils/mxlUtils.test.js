const test = require("node:test");
const assert = require("node:assert/strict");
const JSZip = require("jszip");

const { extractMusicXmlFromMxlBuffer } = require("../../src/utils/mxlUtils");

async function createTestMxlBuffer() {
  const zip = new JSZip();
  zip.file(
    "score.musicxml",
    '<?xml version="1.0"?><score-partwise version="4.0"></score-partwise>',
  );
  zip.file("META-INF/container.xml", "<container></container>");
  return zip.generateAsync({ type: "nodebuffer" });
}

test("extractMusicXmlFromMxlBuffer: extracts embedded MusicXML", async () => {
  const buffer = await createTestMxlBuffer();
  const xml = await extractMusicXmlFromMxlBuffer(buffer);
  assert.match(xml, /<score-partwise/);
});

test("extractMusicXmlFromMxlBuffer: rejects invalid archive", async () => {
  await assert.rejects(
    () => extractMusicXmlFromMxlBuffer(Buffer.from("not-a-zip")),
    /not a valid archive/i,
  );
});

test("extractMusicXmlFromMxlBuffer: rejects archive without MusicXML", async () => {
  const zip = new JSZip();
  zip.file("readme.txt", "hello");
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  await assert.rejects(
    () => extractMusicXmlFromMxlBuffer(buffer),
    /No MusicXML file found/i,
  );
});
