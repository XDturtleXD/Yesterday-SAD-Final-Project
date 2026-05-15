const projectService = require("../services/projectService");
const { sendSuccess } = require("../utils/response");

const createProject = async (req, res, next) => {
  try {
    const project = await projectService.createProject(req.body, req.user.id);
    return sendSuccess(res, project, "Project created successfully", 201);
  } catch (error) {
    return next(error);
  }
};

const getProjects = async (req, res, next) => {
  try {
    const projects = await projectService.listUserProjects(req.user);
    return sendSuccess(res, projects, "Projects fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const getProjectById = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const project = await projectService.getProjectByIdForMember(projectId, req.user);
    return sendSuccess(res, project, "Project fetched successfully");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createProject,
  getProjects,
  getProjectById,
};
