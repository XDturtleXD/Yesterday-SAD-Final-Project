const pieceService = require("../services/pieceService");
const { sendSuccess } = require("../utils/response");

const getProjectPieces = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const pieces = await pieceService.listPiecesByProjectId(projectId);
    return sendSuccess(res, pieces, "Pieces fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const createProjectPiece = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const piece = await pieceService.createPiece(
      req.body,
      projectId,
      req.user.id,
      req.projectMembership,
    );
    return sendSuccess(res, piece, "Piece created successfully", 201);
  } catch (error) {
    return next(error);
  }
};

const deleteProjectPiece = async (req, res, next) => {
  try {
    const { projectId, pieceId } = req.params;
    const result = await pieceService.deletePiece(pieceId, projectId, req.projectMembership);
    return sendSuccess(res, result, "Piece deleted successfully");
  } catch (error) {
    return next(error);
  }
};

const reorderProjectPieces = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const pieces = await pieceService.reorderPieces(req.body, projectId, req.projectMembership);
    return sendSuccess(res, pieces, "Pieces reordered successfully");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getProjectPieces,
  createProjectPiece,
  deleteProjectPiece,
  reorderProjectPieces,
};
