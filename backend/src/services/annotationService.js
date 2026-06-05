const supabase = require("../config/supabase");
const AppError = require("../utils/appError");
const projectService = require("./projectService");
const scoreService = require("./scoreService");
const annotationPermissions = require("./annotationPermissionService");

const ANNOTATION_COLUMNS =
  "id, project_id, score_id, owner_user_id, section_id, scope, annotation_type, target_ref, payload, created_at, updated_at";

const VALID_SCOPES = ["shared", "private"];
const VALID_ANNOTATION_TYPES = [
  "bowing",
  "dynamic",
  "articulation",
  "slur",
  "hairpin",
  "text",
];

const ensureSupabaseReady = () => {
  if (!supabase) {
    throw new AppError("Supabase is not configured", 500);
  }
};

const logAnnotationServiceError = (operation, error) => {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  console.error(`[annotationService] ${operation} failed`, error);
};

const isMissingAnnotationStorageError = (error) => {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  const details = String(error?.details || "");
  const hint = String(error?.hint || "");
  const text = `${message} ${details} ${hint}`.toLowerCase();

  return (
    code === "42P01" ||
    code === "PGRST205" ||
    (text.includes("score_annotations") &&
      (text.includes("does not exist") ||
        text.includes("schema cache") ||
        text.includes("relation")))
  );
};

const annotationStorageError = (operation, error) => {
  logAnnotationServiceError(operation, error);

  if (isMissingAnnotationStorageError(error)) {
    return new AppError(
      "Annotation storage is not available. Apply Supabase migration 20260604_add_score_annotations.sql.",
      503,
      error,
    );
  }

  const message =
    operation === "createAnnotation"
      ? "Failed to create annotation"
      : "Failed to fetch annotations";
  return new AppError(message, 500, error);
};

const isPlainObject = (value) => {
  return value !== null && typeof value === "object" && !Array.isArray(value);
};

const mapAnnotation = (row) => ({
  id: row.id,
  projectId: row.project_id,
  scoreId: row.score_id,
  ownerUserId: row.owner_user_id,
  sectionId: row.section_id,
  scope: row.scope,
  annotationType: row.annotation_type,
  targetRef: row.target_ref,
  payload: row.payload,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const normalizeSectionId = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new AppError("sectionId must be a string", 400);
  }

  const trimmed = value.trim();
  return trimmed || null;
};

const normalizeCreatePayload = (body, score, requestUser) => {
  if (!body || typeof body !== "object") {
    throw new AppError("Request body is required", 400);
  }

  const scope = body.scope;
  if (!VALID_SCOPES.includes(scope)) {
    throw new AppError("scope must be one of shared, private", 400);
  }

  const annotationType = body.annotationType;
  if (!VALID_ANNOTATION_TYPES.includes(annotationType)) {
    throw new AppError(
      `annotationType must be one of ${VALID_ANNOTATION_TYPES.join(", ")}`,
      400,
    );
  }

  if (!isPlainObject(body.targetRef)) {
    throw new AppError("targetRef must be a non-null object", 400);
  }

  if (!isPlainObject(body.payload)) {
    throw new AppError("payload must be a non-null object", 400);
  }

  return {
    project_id: score.project_id,
    score_id: score.id,
    owner_user_id: requestUser.id,
    section_id: normalizeSectionId(body.sectionId) || score.section_id || null,
    scope,
    annotation_type: annotationType,
    target_ref: body.targetRef,
    payload: body.payload,
  };
};

const normalizeUpdatePayload = (body) => {
  if (!body || typeof body !== "object") {
    throw new AppError("Request body is required", 400);
  }

  if (body.scope !== undefined) {
    throw new AppError("scope changes are not supported", 400);
  }

  const patch = {};
  if (body.targetRef !== undefined) {
    if (!isPlainObject(body.targetRef)) {
      throw new AppError("targetRef must be a non-null object", 400);
    }
    patch.target_ref = body.targetRef;
  }

  if (body.payload !== undefined) {
    if (!isPlainObject(body.payload)) {
      throw new AppError("payload must be a non-null object", 400);
    }
    patch.payload = body.payload;
  }

  if (Object.keys(patch).length === 0) {
    throw new AppError("At least one of targetRef or payload is required", 400);
  }

  return patch;
};

const getMembershipForScore = async (score, requestUser) => {
  if (projectService.isPlatformAdmin(requestUser)) {
    return {
      role: "platform_admin",
      section_id: null,
    };
  }

  const membership = await projectService.checkProjectMembership(score.project_id, requestUser.id);
  if (!membership) {
    throw new AppError("Forbidden: you are not a member of this project", 403);
  }

  return membership;
};

const getAnnotationById = async (annotationId) => {
  ensureSupabaseReady();

  const { data, error } = await supabase
    .from("score_annotations")
    .select(ANNOTATION_COLUMNS)
    .eq("id", annotationId)
    .maybeSingle();

  if (error) {
    throw new AppError("Failed to fetch annotation", 500, error);
  }

  if (!data) {
    throw new AppError("Annotation not found", 404);
  }

  return data;
};

const getAnnotationContext = async (annotationId, requestUser) => {
  const annotation = await getAnnotationById(annotationId);
  const score = await scoreService.getScoreById(annotation.score_id);
  const membership = await getMembershipForScore(score, requestUser);

  return { annotation, score, membership };
};

const listVisibleAnnotations = async (score, membership, requestUser) => {
  ensureSupabaseReady();
  scoreService.assertCanViewScore(score, membership);

  const { data, error } = await supabase
    .from("score_annotations")
    .select(ANNOTATION_COLUMNS)
    .eq("score_id", score.id)
    .order("created_at", { ascending: true });

  if (error) {
    throw annotationStorageError("listVisibleAnnotations", error);
  }

  return (data || [])
    .filter((annotation) =>
      annotationPermissions.canReadAnnotation(score, membership, requestUser, annotation),
    )
    .map(mapAnnotation);
};

const createAnnotation = async (score, membership, requestUser, body) => {
  ensureSupabaseReady();
  const row = normalizeCreatePayload(body, score, requestUser);
  annotationPermissions.assertCanCreateAnnotation(score, membership, requestUser, row);

  const { data, error } = await supabase
    .from("score_annotations")
    .insert(row)
    .select(ANNOTATION_COLUMNS)
    .single();

  if (error) {
    throw annotationStorageError("createAnnotation", error);
  }

  return mapAnnotation(data);
};

const updateAnnotation = async (annotationId, requestUser, body) => {
  ensureSupabaseReady();
  const { annotation, score, membership } = await getAnnotationContext(annotationId, requestUser);
  annotationPermissions.assertCanUpdateAnnotation(score, membership, requestUser, annotation);
  const patch = normalizeUpdatePayload(body);

  const { data, error } = await supabase
    .from("score_annotations")
    .update(patch)
    .eq("id", annotation.id)
    .select(ANNOTATION_COLUMNS)
    .single();

  if (error) {
    throw new AppError("Failed to update annotation", 500, error);
  }

  return mapAnnotation(data);
};

const deleteAnnotation = async (annotationId, requestUser) => {
  ensureSupabaseReady();
  const { annotation, score, membership } = await getAnnotationContext(annotationId, requestUser);
  annotationPermissions.assertCanDeleteAnnotation(score, membership, requestUser, annotation);

  const { error } = await supabase
    .from("score_annotations")
    .delete()
    .eq("id", annotation.id);

  if (error) {
    throw new AppError("Failed to delete annotation", 500, error);
  }

  return mapAnnotation(annotation);
};

module.exports = {
  listVisibleAnnotations,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
  getAnnotationById,
  mapAnnotation,
  _helpers: {
    isPlainObject,
    normalizeCreatePayload,
    normalizeUpdatePayload,
    getMembershipForScore,
    isMissingAnnotationStorageError,
  },
};
