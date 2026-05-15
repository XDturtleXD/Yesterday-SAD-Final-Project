const AppError = require("../utils/appError");

/**
 * MVP placeholder for future score edit APIs.
 *
 * Current policy proposal:
 * - platform_admin: can edit all scores
 * - concertmaster: can edit all scores in same project
 * - principal: can edit scores in their own section
 * - member: cannot edit scores
 */
const canEditScoreMiddleware = (req, res, next) => {
  const membership = req.projectMembership;

  if (!membership) {
    return next(new AppError("Permission context is missing", 500));
  }

  if (membership.role === "platform_admin" || membership.role === "concertmaster") {
    return next();
  }

  if (membership.role === "principal" && req.score && req.score.section_id === membership.section_id) {
    return next();
  }

  return next(new AppError("Forbidden: you do not have permission to edit this score", 403));
};

module.exports = canEditScoreMiddleware;
