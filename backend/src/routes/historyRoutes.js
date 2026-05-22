const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const projectPermissionMiddleware = require("../middlewares/projectPermissionMiddleware");
const historyController = require("../controllers/historyController");

const router = express.Router();

// All history routes require authentication and project membership.
router.use(authMiddleware);
router.use("/:projectId", projectPermissionMiddleware("params"));

// Branches
router.get("/:projectId/branches", historyController.listBranches);
router.post("/:projectId/branches", historyController.createBranch);
router.get("/:projectId/branches/:branchId", historyController.getBranch);
router.patch("/:projectId/branches/:branchId", historyController.updateBranch);
router.delete("/:projectId/branches/:branchId", historyController.deleteBranch);

// Commits (versions). /commits/compare must be declared before /commits/:commitId
// so the literal segment wins the match.
router.get("/:projectId/branches/:branchId/commits", historyController.listCommits);
router.post("/:projectId/branches/:branchId/commits", historyController.createCommit);
router.get("/:projectId/commits/compare", historyController.compareCommits);
router.get("/:projectId/commits/:commitId", historyController.getCommit);

// Merge
router.post("/:projectId/merges", historyController.mergeBranches);

module.exports = router;
