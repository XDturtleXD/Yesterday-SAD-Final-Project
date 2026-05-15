const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const loadScoreMiddleware = require("../middlewares/loadScoreMiddleware");
const projectPermissionMiddleware = require("../middlewares/projectPermissionMiddleware");
const scoreController = require("../controllers/scoreController");

const router = express.Router();

router.use(authMiddleware);
router.get(
  "/:scoreId",
  loadScoreMiddleware,
  projectPermissionMiddleware("score"),
  scoreController.getScoreById
);

module.exports = router;
