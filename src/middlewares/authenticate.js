import ApiError from "../utils/ApiError.js";
import { verifyAccessToken } from "../services/token.service.js";
import User from "../models/user.model.js";

export default async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      throw ApiError.unauthorized("Missing or malformed Authorization header");
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw ApiError.unauthorized("Invalid or expired access token");
    }

    const user = await User.findById(payload.sub);
    if (!user || user.status === "disabled") {
      throw ApiError.unauthorized("User no longer active");
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
