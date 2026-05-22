const historyService = require("../services/historyService");
const { sendSuccess } = require("../utils/response");

const listBranches = async (req, res, next) => {
  try {
    const branches = await historyService.listBranches(req.params.projectId);
    return sendSuccess(res, branches, "Branches fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const getBranch = async (req, res, next) => {
  try {
    const branch = await historyService.getBranchById(
      req.params.projectId,
      req.params.branchId,
    );
    return sendSuccess(res, branch, "Branch fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const createBranch = async (req, res, next) => {
  try {
    const branch = await historyService.createBranch(
      req.body,
      req.params.projectId,
      req.user,
    );
    return sendSuccess(res, branch, "Branch created successfully", 201);
  } catch (error) {
    return next(error);
  }
};

const updateBranch = async (req, res, next) => {
  try {
    const branch = await historyService.updateBranch(
      req.body,
      req.params.projectId,
      req.params.branchId,
      req.projectMembership,
    );
    return sendSuccess(res, branch, "Branch updated successfully");
  } catch (error) {
    return next(error);
  }
};

const deleteBranch = async (req, res, next) => {
  try {
    const result = await historyService.deleteBranch(
      req.params.projectId,
      req.params.branchId,
      req.projectMembership,
    );
    return sendSuccess(res, result, "Branch deleted successfully");
  } catch (error) {
    return next(error);
  }
};

const listCommits = async (req, res, next) => {
  try {
    const commits = await historyService.listCommitsForBranch(
      req.params.projectId,
      req.params.branchId,
    );
    return sendSuccess(res, commits, "Commits fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const getCommit = async (req, res, next) => {
  try {
    const commit = await historyService.getCommitDetail(
      req.params.projectId,
      req.params.commitId,
      req.projectMembership,
    );
    return sendSuccess(res, commit, "Commit fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const createCommit = async (req, res, next) => {
  try {
    const commit = await historyService.createCommit(
      req.body,
      req.params.projectId,
      req.params.branchId,
      req.user,
      req.projectMembership,
    );
    return sendSuccess(res, commit, "Commit created successfully", 201);
  } catch (error) {
    return next(error);
  }
};

const compareCommits = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const diff = await historyService.compareCommits(
      req.params.projectId,
      from,
      to,
      req.projectMembership,
    );
    return sendSuccess(res, diff, "Commits compared successfully");
  } catch (error) {
    return next(error);
  }
};

const mergeBranches = async (req, res, next) => {
  try {
    const result = await historyService.mergeBranches(
      req.body,
      req.params.projectId,
      req.user,
      req.projectMembership,
    );
    return sendSuccess(res, result, "Branches merged successfully", 201);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listBranches,
  getBranch,
  createBranch,
  updateBranch,
  deleteBranch,
  listCommits,
  getCommit,
  createCommit,
  compareCommits,
  mergeBranches,
};
