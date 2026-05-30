const express = require("express");
const healthController = require("../controllers/healthController");
const authRoutes = require("./authRoutes");
const projectRoutes = require("./projectRoutes");
const scoreRoutes = require("./scoreRoutes");
const historyRoutes = require("./historyRoutes");
const sectionRoutes = require("./sectionRoutes");
const conversionRoutes = require("./conversionRoutes");

const router = express.Router();

router.get("/health", healthController.getHealth);
router.use("/auth", authRoutes);
router.use("/sections", sectionRoutes);
router.use("/projects", projectRoutes);
router.use("/projects", historyRoutes);
router.use("/scores", scoreRoutes);
router.use("/conversions", conversionRoutes);

module.exports = router;
