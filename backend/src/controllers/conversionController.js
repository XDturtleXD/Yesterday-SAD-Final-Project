const conversionService = require("../services/conversionService");
const pieceService = require("../services/pieceService");
const scoreService = require("../services/scoreService");
const { sendSuccess } = require("../utils/response");

const BAD_MUSICXML_METADATA = new Set(["", "music21", "music21 fragment"]);
const PART_NAME_MAPPINGS = [
  { pattern: /小提琴第一部|小提琴一|\bviolin\s*(?:1|i)\b/i, name: "Violin I" },
  { pattern: /小提琴第二部|小提琴二|\bviolin\s*(?:2|ii)\b/i, name: "Violin II" },
  { pattern: /中提琴|\bviola\b/i, name: "Viola" },
  { pattern: /大提琴|\bcello\b|\bvioloncello\b/i, name: "Cello" },
  { pattern: /低音提琴|\bdouble\s*bass\b|\bcontrabass\b/i, name: "Double Bass" },
];

const escapeXmlText = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const normalizeText = (value) => String(value || "").replace(/\s+/g, " ").trim();

const isBadMusicXmlMetadata = (value) =>
  BAD_MUSICXML_METADATA.has(normalizeText(value).toLowerCase());

const filenameWithoutExtension = (filename) =>
  String(filename || "")
    .trim()
    .replace(/\.[^.]*$/, "");

const firstText = (...values) => values.map(normalizeText).find(Boolean) || null;

const standardizePartName = (value) => {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  const match = PART_NAME_MAPPINGS.find(({ pattern }) => pattern.test(normalized));
  return match ? match.name : normalized;
};

const resolveImportedScoreMetadata = (body, piece) => ({
  title: firstText(
    piece?.title,
    body.pieceTitle,
    body.title,
    filenameWithoutExtension(body.originalFilename),
  ),
  composer: firstText(piece?.composer, body.pieceComposer, body.composer),
  partName: standardizePartName(firstText(body.partName, body.sectionTitle, body.title)),
});

const insertAfterScoreOpenTag = (xmlContent, content) => {
  const scoreOpenTag = xmlContent.match(/<score-(?:partwise|timewise)\b[^>]*>/i);
  if (!scoreOpenTag || typeof scoreOpenTag.index !== "number") return xmlContent;

  const insertAt = scoreOpenTag.index + scoreOpenTag[0].length;
  return `${xmlContent.slice(0, insertAt)}\n  ${content}${xmlContent.slice(insertAt)}`;
};

const ensureWorkTitle = (xmlContent, title) => {
  if (!title) return xmlContent;
  const escapedTitle = escapeXmlText(title);

  if (/<work-title\b/i.test(xmlContent)) {
    return xmlContent.replace(
      /(<work-title\b[^>]*>)(.*?)(<\/work-title>)/is,
      `${"$1"}${escapedTitle}${"$3"}`,
    );
  }

  if (/<work\b[^>]*>/i.test(xmlContent)) {
    return xmlContent.replace(/(<work\b[^>]*>)/i, `$1\n    <work-title>${escapedTitle}</work-title>`);
  }

  return insertAfterScoreOpenTag(xmlContent, `<work>\n    <work-title>${escapedTitle}</work-title>\n  </work>`);
};

const normalizeMovementTitle = (xmlContent, title) => {
  if (!/<movement-title\b/i.test(xmlContent)) return xmlContent;
  if (!title) {
    return xmlContent.replace(
      /<movement-title\b[^>]*>.*?<\/movement-title>/gis,
      (match) => (isBadMusicXmlMetadata(match.replace(/<[^>]+>/g, "")) ? "" : match),
    );
  }

  return xmlContent.replace(
    /(<movement-title\b[^>]*>)(.*?)(<\/movement-title>)/gis,
    (match, openTag, value, closeTag) =>
      isBadMusicXmlMetadata(value) || normalizeText(value)
        ? `${openTag}${escapeXmlText(title)}${closeTag}`
        : match,
  );
};

const ensureComposerCreator = (xmlContent, composer) => {
  if (!composer) {
    return xmlContent.replace(
      /<creator\b[^>]*type=["']composer["'][^>]*>.*?<\/creator>/gis,
      (match) => (isBadMusicXmlMetadata(match.replace(/<[^>]+>/g, "")) ? "" : match),
    );
  }

  const escapedComposer = escapeXmlText(composer);
  const composerCreatorPattern = /(<creator\b[^>]*type=["']composer["'][^>]*>)(.*?)(<\/creator>)/is;

  if (composerCreatorPattern.test(xmlContent)) {
    return xmlContent.replace(composerCreatorPattern, `${"$1"}${escapedComposer}${"$3"}`);
  }

  if (/<identification\b[^>]*>/i.test(xmlContent)) {
    return xmlContent.replace(
      /(<identification\b[^>]*>)/i,
      `$1\n    <creator type="composer">${escapedComposer}</creator>`,
    );
  }

  return insertAfterScoreOpenTag(
    xmlContent,
    `<identification>\n    <creator type="composer">${escapedComposer}</creator>\n  </identification>`,
  );
};

const shouldRemoveCredit = (creditXml, metadata) => {
  const creditTypes = Array.from(creditXml.matchAll(/<credit-type\b[^>]*>(.*?)<\/credit-type>/gis))
    .map((match) => normalizeText(match[1].replace(/<[^>]+>/g, "")).toLowerCase())
    .filter(Boolean);
  if (creditTypes.some((type) => type === "title" || type === "composer")) return true;

  const words = Array.from(creditXml.matchAll(/<credit-words\b[^>]*>(.*?)<\/credit-words>/gis))
    .map((match) => normalizeText(match[1].replace(/<[^>]+>/g, "")))
    .filter(Boolean);
  if (words.length === 0) return false;

  const metadataValues = new Set(
    [metadata.title, metadata.composer].map((value) => normalizeText(value).toLowerCase()).filter(Boolean),
  );

  return words.some((word) => {
    const normalizedWord = word.toLowerCase();
    return isBadMusicXmlMetadata(word) || metadataValues.has(normalizedWord);
  });
};

const removeGeneratedCredits = (xmlContent, metadata) =>
  xmlContent.replace(
    /<credit\b[^>]*>.*?<\/credit>/gis,
    (match) => (shouldRemoveCredit(match, metadata) ? "" : match),
  );

const normalizePartNames = (xmlContent, partName) => {
  if (!partName) return xmlContent;
  const escapedPartName = escapeXmlText(partName);

  if (/<part-name\b/i.test(xmlContent)) {
    return xmlContent.replace(
      /(<part-name\b[^>]*>)(.*?)(<\/part-name>)/i,
      `${"$1"}${escapedPartName}${"$3"}`,
    );
  }

  return xmlContent.replace(
    /(<score-part\b[^>]*>)/i,
    `$1\n      <part-name>${escapedPartName}</part-name>`,
  );
};

const normalizeMusicXmlMetadata = (xmlContent, metadata) => {
  const normalizedMetadata = {
    title: normalizeText(metadata.title),
    composer: normalizeText(metadata.composer),
    partName: standardizePartName(metadata.partName),
  };

  let normalizedXml = String(xmlContent || "");
  normalizedXml = removeGeneratedCredits(normalizedXml, normalizedMetadata);
  normalizedXml = ensureWorkTitle(normalizedXml, normalizedMetadata.title);
  normalizedXml = normalizeMovementTitle(normalizedXml, normalizedMetadata.title);
  normalizedXml = ensureComposerCreator(normalizedXml, normalizedMetadata.composer);
  normalizedXml = normalizePartNames(normalizedXml, normalizedMetadata.partName);

  return normalizedXml;
};

const buildScorePayload = (body, overrides = {}) => {
  const hasPieceId = typeof body.pieceId === "string" && body.pieceId.trim().length > 0;
  const payload = { ...body, ...overrides };

  if (hasPieceId) {
    payload.pieceId = body.pieceId.trim();
  } else if (body.pieceTitle || body.pieceComposer) {
    payload.piece = {
      title: body.pieceTitle,
      composer: body.pieceComposer,
    };
  }

  return payload;
};

const startProjectConversion = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const conversion = await conversionService.startConversion({
      file: req.file,
      preprocessMode: req.body.preprocessMode,
      projectId,
      userId: req.user.id,
    });
    return sendSuccess(res, conversion, "Conversion started", 202);
  } catch (error) {
    return next(error);
  }
};

const getConversionStatus = async (req, res, next) => {
  try {
    const status = await conversionService.getStatus(req.params.jobId, {
      userId: req.user.id,
    });
    return sendSuccess(res, status, "Conversion status fetched");
  } catch (error) {
    return next(error);
  }
};

const getConversionMusicXml = async (req, res, next) => {
  try {
    const xml = await conversionService.getFullMusicXml(req.params.jobId, {
      userId: req.user.id,
    });
    res.type("application/vnd.recordare.musicxml+xml; charset=utf-8");
    return res.send(xml);
  } catch (error) {
    return next(error);
  }
};

const getConversionPageMusicXml = async (req, res, next) => {
  try {
    const xml = await conversionService.getPageMusicXml(
      req.params.jobId,
      req.params.pageNumber,
      { userId: req.user.id },
    );
    res.type("application/vnd.recordare.musicxml+xml; charset=utf-8");
    return res.send(xml);
  } catch (error) {
    return next(error);
  }
};

const importConversionPage = async (req, res, next) => {
  try {
    const { projectId, jobId } = req.params;
    const piece =
      typeof req.body.pieceId === "string" && req.body.pieceId.trim()
        ? await pieceService.getPieceById(req.body.pieceId.trim(), projectId)
        : null;
    const xmlContent = await conversionService.getFullMusicXml(jobId, {
      projectId,
      userId: req.user.id,
    });
    const normalizedXmlContent = normalizeMusicXmlMetadata(
      xmlContent,
      resolveImportedScoreMetadata(req.body, piece),
    );

    const score = await scoreService.uploadScore(
      buildScorePayload(req.body, {
        fileType: "musicxml",
        xmlContent: normalizedXmlContent,
        originalFilename: req.body.originalFilename || `${jobId}.musicxml`,
        mimeType: "application/vnd.recordare.musicxml+xml",
        fileSizeBytes: Buffer.byteLength(normalizedXmlContent, "utf8"),
      }),
      projectId,
      req.user,
      req.projectMembership,
    );

    return sendSuccess(res, score, "Converted score imported", 201);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  startProjectConversion,
  getConversionStatus,
  getConversionMusicXml,
  getConversionPageMusicXml,
  importConversionPage,
};
