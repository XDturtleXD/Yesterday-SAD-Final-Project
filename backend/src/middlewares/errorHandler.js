const AppError = require("../utils/appError");
const { sendError } = require("../utils/response");

const errorHandler = (err, req, res, next) => {
  let statusCode = 500;
  let message = "Internal Server Error";
  let details = null;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (err && typeof err === "object") {
    if (typeof err.statusCode === "number") {
      statusCode = err.statusCode;
    }
    if (typeof err.message === "string" && err.message) {
      message = err.message;
    }
  }

  if (process.env.NODE_ENV !== "production" && err && err.stack) {
    details = details || { stack: err.stack };
  }

  return sendError(res, message, statusCode, details);
};

module.exports = errorHandler;
