const supabase = require("../config/supabase");
const AppError = require("../utils/appError");

const PIECE_COLUMNS =
  "id, project_id, title, composer, sort_order, created_by, created_at, updated_at";

const ensureSupabaseReady = () => {
  if (!supabase) {
    throw new AppError("Supabase is not configured", 500);
  }
};

const canManagePieces = (membership) => {
  if (!membership) return false;
  return membership.role === "platform_admin" || membership.role === "concertmaster";
};

const assertCanManagePieces = (membership) => {
  if (!canManagePieces(membership)) {
    throw new AppError("Forbidden: only the concertmaster can manage pieces", 403);
  }
};

const listPiecesByProjectId = async (projectId) => {
  ensureSupabaseReady();

  const { data, error } = await supabase
    .from("pieces")
    .select(PIECE_COLUMNS)
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new AppError("Failed to fetch pieces", 500, error);
  }

  return data || [];
};

const createPiece = async (body, projectId, userId, membership) => {
  ensureSupabaseReady();
  assertCanManagePieces(membership);

  const title = String(body?.title || "").trim();
  if (!title) {
    throw new AppError("title is required", 400);
  }

  const composer =
    typeof body?.composer === "string" && body.composer.trim()
      ? body.composer.trim()
      : null;

  let sortOrder = body?.sortOrder;
  if (sortOrder != null) {
    sortOrder = Number.parseInt(String(sortOrder), 10);
    if (!Number.isFinite(sortOrder) || sortOrder < 1) {
      throw new AppError("sortOrder must be a positive integer", 400);
    }
  } else {
    const { data: maxRow, error: maxError } = await supabase
      .from("pieces")
      .select("sort_order")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxError) {
      throw new AppError("Failed to compute next piece sort_order", 500, maxError);
    }
    sortOrder = (maxRow?.sort_order ?? 0) + 1;
  }

  const { data: created, error: insertError } = await supabase
    .from("pieces")
    .insert({
      project_id: projectId,
      title,
      composer,
      sort_order: sortOrder,
      created_by: userId,
    })
    .select(PIECE_COLUMNS)
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      throw new AppError("A piece with this title already exists in the project", 409, insertError);
    }
    throw new AppError("Failed to create piece", 500, insertError);
  }

  return created;
};

const getPieceById = async (pieceId, projectId) => {
  ensureSupabaseReady();

  const { data, error } = await supabase
    .from("pieces")
    .select(PIECE_COLUMNS)
    .eq("id", pieceId)
    .maybeSingle();

  if (error) {
    throw new AppError("Failed to fetch piece", 500, error);
  }
  if (!data || data.project_id !== projectId) {
    throw new AppError("Piece not found", 404);
  }

  return data;
};

const deletePiece = async (pieceId, projectId, membership) => {
  ensureSupabaseReady();
  assertCanManagePieces(membership);

  const piece = await getPieceById(pieceId, projectId);

  const { error } = await supabase.from("pieces").delete().eq("id", piece.id);
  if (error) {
    throw new AppError("Failed to delete piece", 500, error);
  }

  return { id: piece.id };
};

const reorderPieces = async (body, projectId, membership) => {
  ensureSupabaseReady();
  assertCanManagePieces(membership);

  const orderedPieceIds = body?.orderedPieceIds;
  if (!Array.isArray(orderedPieceIds) || orderedPieceIds.length === 0) {
    throw new AppError("orderedPieceIds must be a non-empty array", 400);
  }

  const existing = await listPiecesByProjectId(projectId);
  const existingIds = new Set(existing.map((p) => p.id));

  if (orderedPieceIds.length !== existing.length) {
    throw new AppError("orderedPieceIds must include every piece in the project", 400);
  }

  for (const id of orderedPieceIds) {
    if (typeof id !== "string" || !existingIds.has(id)) {
      throw new AppError("orderedPieceIds contains an unknown piece id", 400);
    }
  }

  const unique = new Set(orderedPieceIds);
  if (unique.size !== orderedPieceIds.length) {
    throw new AppError("orderedPieceIds must not contain duplicates", 400);
  }

  const updates = orderedPieceIds.map((id, index) =>
    supabase
      .from("pieces")
      .update({ sort_order: index + 1 })
      .eq("id", id)
      .eq("project_id", projectId),
  );

  const results = await Promise.all(updates);
  for (const { error } of results) {
    if (error) {
      throw new AppError("Failed to reorder pieces", 500, error);
    }
  }

  return listPiecesByProjectId(projectId);
};

module.exports = {
  listPiecesByProjectId,
  createPiece,
  deletePiece,
  reorderPieces,
  getPieceById,
  canManagePieces,
  assertCanManagePieces,
};
