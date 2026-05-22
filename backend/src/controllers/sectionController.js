const sectionService = require("../services/sectionService");
const { sendSuccess } = require("../utils/response");

const getSections = async (_req, res, next) => {
  try {
    const sections = await sectionService.listSections();
    return sendSuccess(res, sections, "Sections fetched successfully");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getSections,
};
