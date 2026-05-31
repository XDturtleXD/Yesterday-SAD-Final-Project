const scoreService = require("../services/scoreService");
const conversionService = require("../services/conversionService");
const AppError = require("../utils/appError");
const { extractMusicXmlFromMxlBuffer } = require("../utils/mxlUtils");
const { sendSuccess } = require("../utils/response");

const XML_EXTENSIONS = new Set([".xml", ".musicxml"]);
const MXL_EXTENSIONS = new Set([".mxl"]);
const PDF_EXTENSIONS = new Set([".pdf"]);

const getFileExtension = (filename = "") => {
  const match = filename.toLowerCase().match(/\.[^.]+$/);
  return match ? match[0] : "";
};

const assertLooksLikeMusicXml = (xmlContent) => {
  const trimmed = String(xmlContent || "").trim();
  if (!trimmed) {
    throw new AppError("Uploaded XML file is empty", 400);
  }
  if (
    !trimmed.includes("<score-partwise") &&
    !trimmed.includes("<score-timewise") &&
    !trimmed.includes("<opus")
  ) {
    throw new AppError("Uploaded XML does not look like a MusicXML score", 400);
  }
};

const getProjectScores = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const scores = await scoreService.listScoresByProjectId(projectId, req.projectMembership);
    return sendSuccess(res, scores, "Scores fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const getScoreById = async (req, res, next) => {
  try {
    scoreService.assertCanViewScore(req.score, req.projectMembership);
    const score = await scoreService.getScoreById(req.score.id);
    return sendSuccess(res, score, "Score fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const uploadScore = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const score = await scoreService.uploadScore(
      req.body,
      projectId,
      req.user,
      req.projectMembership,
    );
    return sendSuccess(res, score, "Score uploaded successfully", 201);
  } catch (error) {
    return next(error);
  }
};

const uploadScoreFile = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const file = req.file;

    if (!file) {
      throw new AppError("Score file is required", 400);
    }

    const extension = getFileExtension(file.originalname);
    if (PDF_EXTENSIONS.has(extension)) {
      const conversion = await conversionService.startConversion({
        file,
        preprocessMode: req.body.preprocessMode,
        projectId,
        userId: req.user.id,
      });
      return sendSuccess(res, conversion, "Conversion started", 202);
    }

    if (!XML_EXTENSIONS.has(extension) && !MXL_EXTENSIONS.has(extension)) {
      throw new AppError("Only PDF, XML, MusicXML, and MXL files are supported", 400);
    }

    let xmlContent;
    let fileType;
    let mimeType;

    if (MXL_EXTENSIONS.has(extension)) {
      xmlContent = await extractMusicXmlFromMxlBuffer(file.buffer);
      assertLooksLikeMusicXml(xmlContent);
      fileType = "mxl";
      mimeType = file.mimetype || "application/vnd.recordare.musicxml";
    } else {
      xmlContent = file.buffer.toString("utf8");
      assertLooksLikeMusicXml(xmlContent);
      fileType = extension === ".xml" ? "xml" : "musicxml";
      mimeType = file.mimetype || "application/vnd.recordare.musicxml+xml";
    }

    const hasPieceId = typeof req.body.pieceId === "string" && req.body.pieceId.trim().length > 0;
    const uploadBody = {
      ...req.body,
      fileType,
      xmlContent,
      originalFilename: file.originalname,
      mimeType,
      fileSizeBytes: file.size,
    };

    if (hasPieceId) {
      uploadBody.pieceId = req.body.pieceId.trim();
    } else if (req.body.pieceTitle || req.body.pieceComposer) {
      uploadBody.piece = {
        title: req.body.pieceTitle,
        composer: req.body.pieceComposer,
      };
    }

    const score = await scoreService.uploadScore(
      uploadBody,
      projectId,
      req.user,
      req.projectMembership,
    );
    return sendSuccess(res, score, "Score uploaded successfully", 201);
  } catch (error) {
    return next(error);
  }
};

const deleteScore = async (req, res, next) => {
  try {
    const deleted = await scoreService.deleteScore(req.score, req.projectMembership);
    return sendSuccess(res, deleted, "Score deleted successfully");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getProjectScores,
  getScoreById,
  uploadScore,
  uploadScoreFile,
  deleteScore,
};
