const annotationService = require("../services/annotationService");
const scoreService = require("../services/scoreService");
const { sendSuccess } = require("../utils/response");

const listScoreAnnotations = async (req, res, next) => {
  try {
    scoreService.assertCanViewScore(req.score, req.projectMembership);
    const annotations = await annotationService.listVisibleAnnotations(
      req.score,
      req.projectMembership,
      req.user,
    );
    return sendSuccess(res, annotations, "Annotations fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const createScoreAnnotation = async (req, res, next) => {
  try {
    const annotation = await annotationService.createAnnotation(
      req.score,
      req.projectMembership,
      req.user,
      req.body,
    );
    return sendSuccess(res, annotation, "Annotation created successfully", 201);
  } catch (error) {
    return next(error);
  }
};

const updateAnnotation = async (req, res, next) => {
  try {
    const annotation = await annotationService.updateAnnotation(
      req.params.annotationId,
      req.user,
      req.body,
    );
    return sendSuccess(res, annotation, "Annotation updated successfully");
  } catch (error) {
    return next(error);
  }
};

const deleteAnnotation = async (req, res, next) => {
  try {
    const annotation = await annotationService.deleteAnnotation(
      req.params.annotationId,
      req.user,
    );
    return sendSuccess(res, annotation, "Annotation deleted successfully");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listScoreAnnotations,
  createScoreAnnotation,
  updateAnnotation,
  deleteAnnotation,
};
