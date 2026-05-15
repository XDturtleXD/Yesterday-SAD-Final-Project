const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const projectPermissionMiddleware = require("../middlewares/projectPermissionMiddleware");
const projectController = require("../controllers/projectController");
const scoreController = require("../controllers/scoreController");

const router = express.Router();

router.use(authMiddleware);
router.post("/", projectController.createProject);
router.get("/", projectController.getProjects);
router.get("/:projectId", projectController.getProjectById);
router.get(
  "/:projectId/scores",
  projectPermissionMiddleware("params"),
  scoreController.getProjectScores
);

module.exports = router;
