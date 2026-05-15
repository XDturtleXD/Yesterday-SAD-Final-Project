const authService = require("../services/authService");
const AppError = require("../utils/appError");
const { verifyAccessToken } = require("../utils/jwt");

const authMiddleware = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization || "";
    const [scheme, token] = authorization.split(" ");

    if (scheme !== "Bearer" || !token) {
      throw new AppError("Unauthorized: Bearer token is required", 401);
    }

    const payload = verifyAccessToken(token);
    const user = await authService.findUserById(payload.sub);

    if (!user) {
      throw new AppError("Unauthorized: user not found", 401);
    }

    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = authMiddleware;
