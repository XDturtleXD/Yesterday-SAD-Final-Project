const scoreService = require("../services/scoreService");
const { sendSuccess } = require("../utils/response");

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

module.exports = {
  getProjectScores,
  getScoreById,
  uploadScore,
};
