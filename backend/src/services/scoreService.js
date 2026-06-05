const supabase = require("../config/supabase");
const AppError = require("../utils/appError");

const SCORE_COLUMNS =
  "id, project_id, piece_id, section_id, title, storage_bucket, storage_path, file_type, original_filename, mime_type, file_size_bytes, created_by, created_at, updated_at";

// Columns returned by upload (includes piece_id and xml_content presence).
const SCORE_COLUMNS_WITH_CONTENT =
  "id, project_id, piece_id, section_id, title, storage_bucket, storage_path, file_type, original_filename, mime_type, file_size_bytes, xml_content, created_by, created_at, updated_at";

const VALID_FILE_TYPES = ["musicxml", "xml", "mxl"];
// 20 MB cap on inline XML payloads to keep request bodies sane while allowing
// larger edited MusicXML saves.
const MAX_INLINE_XML_BYTES = 20 * 1024 * 1024;

const ensureSupabaseReady = () => {
  if (!supabase) {
    throw new AppError("Supabase is not configured", 500);
  }
};

const canViewScore = (score, membership) => {
  if (!score) {
    return false;
  }

  if (!membership || membership.role === "platform_admin" || membership.role === "concertmaster") {
    return true;
  }

  if (membership.role === "principal" || membership.role === "member") {
    return true;
  }

  return false;
};

const assertCanViewScore = (score, membership) => {
  if (!canViewScore(score, membership)) {
    throw new AppError("Forbidden: you do not have permission to view this score", 403);
  }
};

const applyScoreVisibilityFilter = (query, membership) => {
  if (!membership || membership.role === "platform_admin" || membership.role === "concertmaster") {
    return query;
  }

  if (membership.role === "principal" || membership.role === "member") {
    return query;
  }

  return query.eq("id", "__no_access__");
};

const listScoresByProjectId = async (projectId, membership) => {
  ensureSupabaseReady();

  let query = supabase
    .from("scores")
    .select(SCORE_COLUMNS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  query = applyScoreVisibilityFilter(query, membership);

  const { data, error } = await query;

  if (error) {
    throw new AppError("Failed to fetch scores", 500, error);
  }

  return data || [];
};

const getScoreById = async (scoreId) => {
  ensureSupabaseReady();

  const { data, error } = await supabase
    .from("scores")
    .select(SCORE_COLUMNS_WITH_CONTENT)
    .eq("id", scoreId)
    .maybeSingle();

  if (error) {
    throw new AppError("Failed to fetch score", 500, error);
  }

  if (!data) {
    throw new AppError("Score not found", 404);
  }

  return data;
};

const updateScoreMusicXml = async (score, xmlContent) => {
  ensureSupabaseReady();

  if (!score) {
    throw new AppError("Score not found", 404);
  }

  if (typeof xmlContent !== "string" || xmlContent.trim().length === 0) {
    throw new AppError("xmlContent must be a non-empty string", 400);
  }

  if (xmlContent.length > MAX_INLINE_XML_BYTES) {
    throw new AppError(
      `xmlContent exceeds maximum size of ${MAX_INLINE_XML_BYTES} bytes`,
      413,
    );
  }

  const { data, error } = await supabase
    .from("scores")
    .update({ xml_content: xmlContent })
    .eq("id", score.id)
    .select(SCORE_COLUMNS_WITH_CONTENT)
    .single();

  if (error) {
    throw new AppError("Failed to update score MusicXML", 500, error);
  }

  return data;
};

// ---------------------------------------------------------------------------
// Upload (create) a score
// ---------------------------------------------------------------------------

const canUploadScore = (membership, sectionId) => {
  if (!membership) return false;
  if (membership.role === "platform_admin" || membership.role === "concertmaster") {
    return true;
  }
  if (membership.role === "principal") {
    return membership.section_id === sectionId;
  }
  // member is not allowed.
  return false;
};

const assertCanUploadScore = (membership, sectionId) => {
  if (!canUploadScore(membership, sectionId)) {
    throw new AppError(
      "Forbidden: you do not have permission to upload a score for this section",
      403,
    );
  }
};

const normalizeUploadPayload = (body) => {
  if (!body || typeof body !== "object") {
    throw new AppError("Request body is required", 400);
  }

  const sectionId = body.sectionId;
  if (!sectionId || typeof sectionId !== "string") {
    throw new AppError("sectionId is required", 400);
  }

  const title = String(body.title || "").trim();
  if (!title) {
    throw new AppError("title is required", 400);
  }

  const hasPieceId = typeof body.pieceId === "string" && body.pieceId.length > 0;
  const piece = body.piece && typeof body.piece === "object" ? body.piece : null;
  const pieceTitle = piece && typeof piece.title === "string" ? piece.title.trim() : "";

  if (!hasPieceId && !pieceTitle) {
    throw new AppError("Either pieceId or piece.title is required", 400);
  }
  if (hasPieceId && pieceTitle) {
    throw new AppError("Provide pieceId or piece.title, not both", 400);
  }

  const fileType = body.fileType ? String(body.fileType) : "musicxml";
  if (!VALID_FILE_TYPES.includes(fileType)) {
    throw new AppError(
      `Invalid fileType '${fileType}'; expected one of ${VALID_FILE_TYPES.join(", ")}`,
      400,
    );
  }

  const xmlContent =
    typeof body.xmlContent === "string" && body.xmlContent.trim().length > 0
      ? body.xmlContent
      : null;
  const storagePath =
    typeof body.storagePath === "string" && body.storagePath.trim().length > 0
      ? body.storagePath.trim()
      : null;

  if (!xmlContent && !storagePath) {
    throw new AppError(
      "Either xmlContent or storagePath is required",
      400,
    );
  }
  if (xmlContent && xmlContent.length > MAX_INLINE_XML_BYTES) {
    throw new AppError(
      `xmlContent exceeds maximum size of ${MAX_INLINE_XML_BYTES} bytes`,
      413,
    );
  }

  const storageBucket =
    typeof body.storageBucket === "string" && body.storageBucket.trim().length > 0
      ? body.storageBucket.trim()
      : "scores";

  return {
    sectionId,
    title,
    pieceId: hasPieceId ? body.pieceId : null,
    pieceTitle: pieceTitle || null,
    pieceComposer:
      piece && typeof piece.composer === "string" && piece.composer.trim()
        ? piece.composer.trim()
        : null,
    fileType,
    xmlContent,
    storagePath,
    storageBucket,
    originalFilename:
      typeof body.originalFilename === "string" && body.originalFilename.trim()
        ? body.originalFilename.trim()
        : null,
    mimeType:
      typeof body.mimeType === "string" && body.mimeType.trim()
        ? body.mimeType.trim()
        : null,
    fileSizeBytes:
      typeof body.fileSizeBytes === "number" && body.fileSizeBytes >= 0
        ? body.fileSizeBytes
        : null,
  };
};

const findOrCreatePiece = async (projectId, { pieceId, pieceTitle, pieceComposer }, userId) => {
  // Caller-supplied pieceId: just verify it belongs to the project.
  if (pieceId) {
    const { data: existing, error } = await supabase
      .from("pieces")
      .select("id, project_id, title, composer, sort_order")
      .eq("id", pieceId)
      .maybeSingle();
    if (error) {
      throw new AppError("Failed to fetch piece", 500, error);
    }
    if (!existing || existing.project_id !== projectId) {
      throw new AppError("Piece not found in this project", 404);
    }
    return existing;
  }

  // Otherwise: find by (project_id, title); create if missing.
  const { data: byTitle, error: findError } = await supabase
    .from("pieces")
    .select("id, project_id, title, composer, sort_order")
    .eq("project_id", projectId)
    .eq("title", pieceTitle)
    .maybeSingle();
  if (findError) {
    throw new AppError("Failed to look up piece", 500, findError);
  }
  if (byTitle) {
    return byTitle;
  }

  // Assign the next sort_order so the partial unique (project_id, sort_order) holds.
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
  const nextSortOrder = (maxRow && maxRow.sort_order ? maxRow.sort_order : 0) + 1;

  const { data: created, error: insertError } = await supabase
    .from("pieces")
    .insert({
      project_id: projectId,
      title: pieceTitle,
      composer: pieceComposer,
      sort_order: nextSortOrder,
      created_by: userId,
    })
    .select("id, project_id, title, composer, sort_order")
    .single();
  if (insertError) {
    // 23505 = unique_violation (e.g. title race condition); re-fetch and return.
    if (insertError.code === "23505") {
      const { data: raced } = await supabase
        .from("pieces")
        .select("id, project_id, title, composer, sort_order")
        .eq("project_id", projectId)
        .eq("title", pieceTitle)
        .maybeSingle();
      if (raced) return raced;
    }
    throw new AppError("Failed to create piece", 500, insertError);
  }
  return created;
};

const ensureSectionExists = async (sectionId) => {
  const { data, error } = await supabase
    .from("sections")
    .select("id")
    .eq("id", sectionId)
    .maybeSingle();
  if (error) {
    throw new AppError("Failed to validate sectionId", 500, error);
  }
  if (!data) {
    throw new AppError("Invalid sectionId: section does not exist", 400);
  }
};

const synthesizeInlineStoragePath = ({ projectId, pieceId, sectionId, fileType }) => {
  // The schema requires storage_path NOT NULL. For inline uploads we synthesize
  // a stable identifier so the column has a meaningful value even though no
  // object lives at this path.
  const ext = fileType === "mxl" ? "mxl" : "musicxml";
  return `inline/${projectId}/${pieceId}/${sectionId}.${ext}`;
};

const uploadScore = async (body, projectId, requestUser, membership) => {
  ensureSupabaseReady();

  const payload = normalizeUploadPayload(body);
  assertCanUploadScore(membership, payload.sectionId);
  await ensureSectionExists(payload.sectionId);

  const piece = await findOrCreatePiece(
    projectId,
    {
      pieceId: payload.pieceId,
      pieceTitle: payload.pieceTitle,
      pieceComposer: payload.pieceComposer,
    },
    requestUser.id,
  );

  const storagePath =
    payload.storagePath ||
    synthesizeInlineStoragePath({
      projectId,
      pieceId: piece.id,
      sectionId: payload.sectionId,
      fileType: payload.fileType,
    });

  const { data: created, error: insertError } = await supabase
    .from("scores")
    .insert({
      project_id: projectId,
      piece_id: piece.id,
      section_id: payload.sectionId,
      title: payload.title,
      storage_bucket: payload.storageBucket,
      storage_path: storagePath,
      file_type: payload.fileType,
      original_filename: payload.originalFilename,
      mime_type: payload.mimeType,
      file_size_bytes: payload.fileSizeBytes,
      xml_content: payload.xmlContent,
      created_by: requestUser.id,
    })
    .select(SCORE_COLUMNS_WITH_CONTENT)
    .single();

  if (insertError) {
    // 23505 on scores_piece_section_unique means a score already exists for this
    // (piece, section). Surface as 409 so the frontend can prompt for replace.
    if (insertError.code === "23505") {
      throw new AppError(
        "A score already exists for this piece and section",
        409,
        insertError,
      );
    }
    // 23503 on section_id is the only foreign-key path we didn't already validate;
    // bubble up as a 400 with a clearer message.
    if (
      insertError.code === "23503" &&
      String(insertError.message || "").includes("section_id")
    ) {
      throw new AppError("Invalid sectionId: section does not exist", 400, insertError);
    }
    throw new AppError("Failed to create score", 500, insertError);
  }

  return created;
};

const deleteScore = async (score, membership) => {
  ensureSupabaseReady();

  if (!score) {
    throw new AppError("Score not found", 404);
  }

  assertCanUploadScore(membership, score.section_id);

  const { error } = await supabase
    .from("scores")
    .delete()
    .eq("id", score.id);

  if (error) {
    throw new AppError("Failed to delete score", 500, error);
  }

  return score;
};

module.exports = {
  listScoresByProjectId,
  getScoreById,
  canViewScore,
  assertCanViewScore,
  updateScoreMusicXml,
  uploadScore,
  deleteScore,
  // Pure helpers exported for unit tests (no Supabase dependency required).
  _helpers: {
    canUploadScore,
    assertCanUploadScore,
    normalizeUploadPayload,
    synthesizeInlineStoragePath,
  },
};
