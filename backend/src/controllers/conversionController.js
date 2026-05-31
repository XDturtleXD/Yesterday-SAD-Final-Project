const conversionService = require("../services/conversionService");
const scoreService = require("../services/scoreService");
const { sendSuccess } = require("../utils/response");

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
    const xmlContent = await conversionService.getFullMusicXml(jobId, {
      projectId,
      userId: req.user.id,
    });

    const score = await scoreService.uploadScore(
      buildScorePayload(req.body, {
        fileType: "musicxml",
        xmlContent,
        originalFilename: req.body.originalFilename || `${jobId}.musicxml`,
        mimeType: "application/vnd.recordare.musicxml+xml",
        fileSizeBytes: Buffer.byteLength(xmlContent, "utf8"),
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
