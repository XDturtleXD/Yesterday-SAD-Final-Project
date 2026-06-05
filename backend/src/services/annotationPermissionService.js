const { canViewScore } = require("./scoreService");
const AppError = require("../utils/appError");

const isAdminRole = (role) => role === "platform_admin" || role === "concertmaster";

const annotationOwnerId = (annotation) =>
  annotation && (annotation.owner_user_id || annotation.ownerUserId);

const annotationSectionId = (annotation) =>
  annotation && (annotation.section_id || annotation.sectionId);

const isOwnSectionScore = (score, membership) =>
  !!score && !!membership && score.section_id === membership.section_id;

const canAnnotateOwnSectionScore = (score, membership) => {
  if (!score || !membership) return false;
  if (isAdminRole(membership.role)) return true;
  if (membership.role === "member" || membership.role === "principal") {
    return isOwnSectionScore(score, membership);
  }
  return false;
};

const canCreatePrivateAnnotation = (score, membership, requestUser, annotation = {}) => {
  if (!requestUser || !canViewScore(score, membership)) return false;
  if (!canAnnotateOwnSectionScore(score, membership)) return false;

  const ownerUserId = annotationOwnerId(annotation);
  return !ownerUserId || ownerUserId === requestUser.id;
};

const canCreateSharedAnnotation = (score, membership, annotation = {}) => {
  if (!canViewScore(score, membership)) return false;
  if (!membership) return false;

  if (membership.role !== "principal") {
    return false;
  }

  const targetSectionId = annotationSectionId(annotation);
  return (
    !!score &&
    score.section_id === membership.section_id &&
    targetSectionId === membership.section_id
  );
};

const canCreateAnnotation = (score, membership, requestUser, annotation = {}) => {
  if (annotation.scope === "private") {
    return canCreatePrivateAnnotation(score, membership, requestUser, annotation);
  }

  if (annotation.scope === "shared") {
    return canCreateSharedAnnotation(score, membership, annotation);
  }

  return false;
};

const canReadAnnotation = (score, membership, requestUser, annotation) => {
  if (!annotation || !canViewScore(score, membership)) return false;

  if (annotation.scope === "private") {
    return !!requestUser && annotationOwnerId(annotation) === requestUser.id;
  }

  if (annotation.scope === "shared") {
    if (isAdminRole(membership?.role)) {
      return true;
    }
    return annotationSectionId(annotation) === membership?.section_id;
  }

  return false;
};

const canUpdateAnnotation = (score, membership, requestUser, annotation) => {
  if (!annotation || !canReadAnnotation(score, membership, requestUser, annotation)) {
    return false;
  }

  if (annotation.scope === "private") {
    return canCreatePrivateAnnotation(score, membership, requestUser, annotation);
  }

  return canCreateSharedAnnotation(score, membership, annotation);
};

const canDeleteAnnotation = canUpdateAnnotation;

const assertCanCreateAnnotation = (score, membership, requestUser, annotation) => {
  if (!canCreateAnnotation(score, membership, requestUser, annotation)) {
    throw new AppError("Forbidden: you do not have permission to create this annotation", 403);
  }
};

const assertCanReadAnnotation = (score, membership, requestUser, annotation) => {
  if (!canReadAnnotation(score, membership, requestUser, annotation)) {
    throw new AppError("Forbidden: you do not have permission to read this annotation", 403);
  }
};

const assertCanUpdateAnnotation = (score, membership, requestUser, annotation) => {
  if (!canUpdateAnnotation(score, membership, requestUser, annotation)) {
    throw new AppError("Forbidden: you do not have permission to update this annotation", 403);
  }
};

const assertCanDeleteAnnotation = (score, membership, requestUser, annotation) => {
  if (!canDeleteAnnotation(score, membership, requestUser, annotation)) {
    throw new AppError("Forbidden: you do not have permission to delete this annotation", 403);
  }
};

module.exports = {
  canCreatePrivateAnnotation,
  canCreateSharedAnnotation,
  canCreateAnnotation,
  canReadAnnotation,
  canUpdateAnnotation,
  canDeleteAnnotation,
  assertCanCreateAnnotation,
  assertCanReadAnnotation,
  assertCanUpdateAnnotation,
  assertCanDeleteAnnotation,
  _helpers: {
    isAdminRole,
    canAnnotateOwnSectionScore,
  },
};
