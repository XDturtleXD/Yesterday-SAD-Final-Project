const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const annotationController = require("../controllers/annotationController");

const router = express.Router();

router.use(authMiddleware);
router.patch("/:annotationId", annotationController.updateAnnotation);
router.delete("/:annotationId", annotationController.deleteAnnotation);

module.exports = router;
