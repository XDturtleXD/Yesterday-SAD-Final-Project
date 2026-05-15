const healthService = require("../services/healthService");
const { sendSuccess } = require("../utils/response");

const getHealth = async (req, res, next) => {
  try {
    const status = await healthService.getHealthStatus();
    return sendSuccess(res, status, "Backend is running");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getHealth,
};
