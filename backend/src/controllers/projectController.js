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

const createInviteCode = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const result = await projectService.createProjectInviteCode(projectId, req.user, req.body);
    return sendSuccess(res, result, "Invite code created successfully");
  } catch (error) {
    return next(error);
  }
};

const joinByInviteCode = async (req, res, next) => {
  try {
    const result = await projectService.joinProjectByInviteCode(req.body, req.user);
    return sendSuccess(res, result, "Joined project successfully", 201);
  } catch (error) {
    return next(error);
  }
};

const getProjectMembers = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const members = await projectService.listProjectMembers(projectId, req.user);
    return sendSuccess(res, members, "Project members fetched successfully");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createProject,
  getProjects,
  getProjectById,
  getProjectMembers,
  createInviteCode,
  joinByInviteCode,
};
