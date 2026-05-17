const jwt = require("jsonwebtoken");
const env = require("../config/env");
const AppError = require("./appError");

const signInviteToken = (payload) => {
  if (!env.jwtSecret) {
    throw new AppError("JWT_SECRET is not configured", 500);
  }

  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
};

const verifyInviteToken = (token) => {
  if (!env.jwtSecret) {
    throw new AppError("JWT_SECRET is not configured", 500);
  }

  try {
    return jwt.verify(token, env.jwtSecret);
  } catch (error) {
    throw new AppError("Invalid or expired invite code", 400);
  }
};

module.exports = {
  signInviteToken,
  verifyInviteToken,
};
