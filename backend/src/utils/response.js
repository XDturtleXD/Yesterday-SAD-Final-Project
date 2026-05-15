const sendSuccess = (res, data = null, message = "Success", statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    error: null,
  });
};

const sendError = (res, message = "Internal Server Error", statusCode = 500, error = null) => {
  return res.status(statusCode).json({
    success: false,
    message,
    data: null,
    error,
  });
};

module.exports = {
  sendSuccess,
  sendError,
};
