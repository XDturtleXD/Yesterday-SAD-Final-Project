const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const canEditScoreMiddleware = require("../middlewares/canEditScoreMiddleware");
const loadScoreMiddleware = require("../middlewares/loadScoreMiddleware");
const projectPermissionMiddleware = require("../middlewares/projectPermissionMiddleware");
const scoreController = require("../controllers/scoreController");

const router = express.Router();

router.use(authMiddleware);
router.patch(
  "/:scoreId/musicxml",
  loadScoreMiddleware,
  projectPermissionMiddleware("score"),
  canEditScoreMiddleware,
  scoreController.updateScoreMusicXml
);
router.get(
  "/:scoreId",
  loadScoreMiddleware,
  projectPermissionMiddleware("score"),
  scoreController.getScoreById
);
router.delete(
  "/:scoreId",
  loadScoreMiddleware,
  projectPermissionMiddleware("score"),
  scoreController.deleteScore
);

module.exports = router;
