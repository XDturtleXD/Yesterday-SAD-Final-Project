const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const projectPermissionMiddleware = require("../middlewares/projectPermissionMiddleware");
const projectController = require("../controllers/projectController");
const scoreController = require("../controllers/scoreController");

const router = express.Router();

router.use(authMiddleware);
router.post("/join-by-code", projectController.joinByInviteCode);
router.post("/", projectController.createProject);
router.get("/", projectController.getProjects);
router.get("/:projectId", projectController.getProjectById);
router.get("/:projectId/members", projectController.getProjectMembers);
router.post("/:projectId/invite-code", projectController.createInviteCode);
router.get(
  "/:projectId/scores",
  projectPermissionMiddleware("params"),
  scoreController.getProjectScores
);
router.post(
  "/:projectId/scores",
  projectPermissionMiddleware("params"),
  scoreController.uploadScore
);

module.exports = router;
