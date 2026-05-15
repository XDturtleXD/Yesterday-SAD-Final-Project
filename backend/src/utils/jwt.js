const jwt = require("jsonwebtoken");
const env = require("../config/env");
const AppError = require("./appError");

const signAccessToken = (payload) => {
  if (!env.jwtSecret) {
    throw new AppError("JWT_SECRET is not configured", 500);
  }

  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
};

const verifyAccessToken = (token) => {
  if (!env.jwtSecret) {
    throw new AppError("JWT_SECRET is not configured", 500);
  }

  try {
    return jwt.verify(token, env.jwtSecret);
  } catch (error) {
    throw new AppError("Invalid or expired token", 401);
  }
};

module.exports = {
  signAccessToken,
  verifyAccessToken,
};
