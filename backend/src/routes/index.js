const express = require("express");
const healthController = require("../controllers/healthController");
const authRoutes = require("./authRoutes");
const projectRoutes = require("./projectRoutes");
const scoreRoutes = require("./scoreRoutes");

const router = express.Router();

router.get("/health", healthController.getHealth);
router.use("/auth", authRoutes);
router.use("/projects", projectRoutes);
router.use("/scores", scoreRoutes);

module.exports = router;
