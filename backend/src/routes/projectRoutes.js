const express = require("express");
const multer = require("multer");
const authMiddleware = require("../middlewares/authMiddleware");
const projectPermissionMiddleware = require("../middlewares/projectPermissionMiddleware");
const projectController = require("../controllers/projectController");
const pieceController = require("../controllers/pieceController");
const scoreController = require("../controllers/scoreController");
const conversionController = require("../controllers/conversionController");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
});

router.use(authMiddleware);
router.post("/join-by-code", projectController.joinByInviteCode);
router.post("/", projectController.createProject);
router.get("/", projectController.getProjects);
router.get("/:projectId", projectController.getProjectById);
router.get("/:projectId/members", projectController.getProjectMembers);
router.post("/:projectId/invite-code", projectController.createInviteCode);
router.get(
  "/:projectId/pieces",
  projectPermissionMiddleware("params"),
  pieceController.getProjectPieces,
);
router.post(
  "/:projectId/pieces",
  projectPermissionMiddleware("params"),
  pieceController.createProjectPiece,
);
router.patch(
  "/:projectId/pieces/reorder",
  projectPermissionMiddleware("params"),
  pieceController.reorderProjectPieces,
);
router.patch(
  "/:projectId/pieces/:pieceId",
  projectPermissionMiddleware("params"),
  pieceController.updateProjectPiece,
);
router.delete(
  "/:projectId/pieces/:pieceId",
  projectPermissionMiddleware("params"),
  pieceController.deleteProjectPiece,
);
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
router.post(
  "/:projectId/scores/upload",
  projectPermissionMiddleware("params"),
  upload.single("file"),
  scoreController.uploadScoreFile
);
router.post(
  "/:projectId/conversions",
  projectPermissionMiddleware("params"),
  upload.single("file"),
  conversionController.startProjectConversion
);
router.post(
  "/:projectId/conversions/:jobId/import",
  projectPermissionMiddleware("params"),
  conversionController.importConversionPage
);

module.exports = router;
