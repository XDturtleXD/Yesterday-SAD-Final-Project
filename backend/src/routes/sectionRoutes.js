const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const sectionController = require("../controllers/sectionController");

const router = express.Router();

router.use(authMiddleware);
router.get("/", sectionController.getSections);

module.exports = router;
