const scoreService = require("../services/scoreService");

const loadScoreMiddleware = async (req, res, next) => {
  try {
    const { scoreId } = req.params;
    const score = await scoreService.getScoreById(scoreId);
    req.score = score;
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = loadScoreMiddleware;
