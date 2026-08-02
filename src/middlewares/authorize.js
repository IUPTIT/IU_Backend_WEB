import ApiError from "../utils/ApiError.js";

// Restrict a route to given roles. Use after authenticate.
export default function authorize(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden("You do not have permission"));
    }
    return next();
  };
}
