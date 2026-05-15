const supabase = require("../config/supabase");
const AppError = require("../utils/appError");

const SCORE_COLUMNS =
  "id, project_id, section_id, title, storage_bucket, storage_path, file_type, original_filename, mime_type, file_size_bytes, created_by, created_at, updated_at";

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
    return score.section_id === membership.section_id;
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
    return query.eq("section_id", membership.section_id);
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
    .select(SCORE_COLUMNS)
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

module.exports = {
  listScoresByProjectId,
  getScoreById,
  canViewScore,
  assertCanViewScore,
};
