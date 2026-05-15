const AppError = require("../utils/appError");
const projectService = require("../services/projectService");

const projectPermissionMiddleware = (projectIdSource = "params") => {
  return async (req, res, next) => {
    try {
      if (projectService.isPlatformAdmin(req.user)) {
        req.projectMembership = {
          role: "platform_admin",
          section_id: null,
        };
        return next();
      }

      const projectId =
        projectIdSource === "score"
          ? req.score && req.score.project_id
          : req.params.projectId;

      if (!projectId) {
        throw new AppError("projectId is required for permission check", 400);
      }

      const membership = await projectService.checkProjectMembership(projectId, req.user.id);
      if (!membership) {
        throw new AppError("Forbidden: you are not a member of this project", 403);
      }

      req.projectMembership = membership;
      return next();
    } catch (error) {
      return next(error);
    }
  };
};

module.exports = projectPermissionMiddleware;
