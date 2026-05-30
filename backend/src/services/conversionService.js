const env = require("../config/env");
const AppError = require("../utils/appError");

const VALID_PREPROCESS_MODES = new Set([
  "none",
  "basic",
  "high_contrast",
  "resize",
  "classical_part",
  "thin_ink",
]);

const jobs = new Map();

const buildOmrUrl = (path) => `${env.omrServiceUrl.replace(/\/$/, "")}${path}`;

const parseOmrResponse = async (response) => {
  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    let message = "OMR service request failed";
    if (contentType.includes("application/json")) {
      try {
        const parsed = JSON.parse(text);
        message = parsed.detail || parsed.message || message;
      } catch {
        message = text || message;
      }
    } else if (text) {
      message = text;
    }
    throw new AppError(message, response.status >= 500 ? 502 : response.status);
  }

  if (contentType.includes("application/json")) {
    return JSON.parse(text);
  }

  return text;
};

const normalizePreprocessMode = (value) => {
  const mode = String(value || "none").trim() || "none";
  if (!VALID_PREPROCESS_MODES.has(mode)) {
    throw new AppError("Invalid preprocessMode", 400);
  }
  return mode;
};

const assertJobAccess = (jobId, { projectId, userId } = {}) => {
  const job = jobs.get(jobId);
  if (!job) {
    throw new AppError("Conversion job not found", 404);
  }
  if (userId && job.userId !== userId) {
    throw new AppError("Forbidden: you do not have access to this conversion job", 403);
  }
  if (projectId && job.projectId !== projectId) {
    throw new AppError("Conversion job does not belong to this project", 403);
  }
  return job;
};

const rememberJob = (job) => {
  jobs.set(job.jobId, {
    ...job,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
};

const updateJob = (jobId, updates) => {
  const existing = jobs.get(jobId);
  if (!existing) return null;
  const next = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  jobs.set(jobId, next);
  return next;
};

const startConversion = async ({ file, preprocessMode, projectId, userId }) => {
  if (!file) {
    throw new AppError("PDF file is required", 400);
  }

  const filename = file.originalname || "score.pdf";
  if (!filename.toLowerCase().endsWith(".pdf")) {
    throw new AppError("Only PDF files are supported", 400);
  }

  const form = new FormData();
  form.append(
    "file",
    new Blob([file.buffer], { type: file.mimetype || "application/pdf" }),
    filename,
  );
  form.append("preprocess_mode", normalizePreprocessMode(preprocessMode));
  form.append("engine", "audiveris");

  const response = await fetch(buildOmrUrl("/upload"), {
    method: "POST",
    body: form,
  });

  const result = await parseOmrResponse(response);
  const jobId = result.job_id || result.jobId;
  if (!jobId) {
    throw new AppError("OMR service did not return a job id", 502);
  }

  rememberJob({
    jobId,
    projectId,
    userId,
    originalFilename: filename,
    preprocessMode: normalizePreprocessMode(preprocessMode),
    status: "queued",
    errorMessage: null,
  });

  return {
    jobId,
    status: "queued",
    originalFilename: filename,
  };
};

const getStatus = async (jobId, access = {}) => {
  const job = assertJobAccess(jobId, access);
  const response = await fetch(buildOmrUrl(`/status/${encodeURIComponent(jobId)}`));
  const status = await parseOmrResponse(response);
  updateJob(jobId, {
    status: status.status,
    errorMessage: status.error_message || null,
  });
  return {
    ...status,
    project_id: job.projectId,
    original_filename: job.originalFilename,
  };
};

const getFullMusicXml = async (jobId, access = {}) => {
  assertJobAccess(jobId, access);
  const response = await fetch(buildOmrUrl(`/result/${encodeURIComponent(jobId)}/musicxml/raw`));
  return parseOmrResponse(response);
};

const getPageMusicXml = async (jobId, pageNumber, access = {}) => {
  assertJobAccess(jobId, access);
  const response = await fetch(
    buildOmrUrl(
      `/result/${encodeURIComponent(jobId)}/audiveris/page/${encodeURIComponent(pageNumber)}/raw`,
    ),
  );
  return parseOmrResponse(response);
};

module.exports = {
  startConversion,
  getStatus,
  getFullMusicXml,
  getPageMusicXml,
  _helpers: {
    normalizePreprocessMode,
    assertJobAccess,
  },
};
