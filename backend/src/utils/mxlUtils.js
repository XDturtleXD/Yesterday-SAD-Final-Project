const JSZip = require("jszip");
const AppError = require("./appError");

function isMusicXmlEntryName(name) {
  if (!name || name.endsWith("/")) return false;
  const lower = name.toLowerCase();
  if (lower.includes("meta-inf/")) return false;
  return lower.endsWith(".musicxml") || lower.endsWith(".xml");
}

async function extractMusicXmlFromMxlBuffer(buffer) {
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new AppError("Uploaded MXL file is not a valid archive", 400);
  }

  const entries = Object.keys(zip.files).filter(isMusicXmlEntryName);
  const musicxmlEntries = entries.filter((name) => name.toLowerCase().endsWith(".musicxml"));
  const selected = (musicxmlEntries[0] || entries[0]) ?? null;

  if (!selected) {
    throw new AppError("No MusicXML file found inside MXL archive", 400);
  }

  return zip.file(selected).async("string");
}

module.exports = {
  extractMusicXmlFromMxlBuffer,
};
