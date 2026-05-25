const authService = require("../services/authService");
const AppError = require("../utils/appError");
const { sendSuccess } = require("../utils/response");

const register = async (req, res, next) => {
  try {
    const user = await authService.register(req.body);
    return sendSuccess(res, user, "User registered successfully", 201);
  } catch (error) {
    return next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const result = await authService.login(req.body);
    return sendSuccess(res, result, "Login successful");
  } catch (error) {
    return next(error);
  }
};

const googleLogin = async (req, res, next) => {
  try {
    const result = await authService.googleLogin(req.body);
    return sendSuccess(res, result, "Google login successful");
  } catch (error) {
    return next(error);
  }
};

const me = async (req, res, next) => {
  try {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }

    return sendSuccess(res, req.user, "Current user fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const updateMe = async (req, res, next) => {
  try {
    if (!req.user) {
      throw new AppError("Unauthorized", 401);
    }

    const user = await authService.updateProfile(req.user.id, req.body);
    return sendSuccess(res, user, "Profile updated successfully");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  register,
  login,
  googleLogin,
  me,
  updateMe,
};
