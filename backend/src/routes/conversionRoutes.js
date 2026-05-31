const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const conversionController = require("../controllers/conversionController");

const router = express.Router();

router.use(authMiddleware);
router.get("/:jobId", conversionController.getConversionStatus);
router.get("/:jobId/musicxml", conversionController.getConversionMusicXml);
router.get(
  "/:jobId/pages/:pageNumber/musicxml",
  conversionController.getConversionPageMusicXml,
);

module.exports = router;
