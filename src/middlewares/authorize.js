import ApiError from "../utils/ApiError.js";

// Restrict a route to one or more roles. Use after `authenticate`.
// Example: router.get('/admin', authenticate, authorize('bcn'), handler)
export default function authorize(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!allowedRoles.includes(req.user.role)) {
      return next(
        ApiError.forbidden("You do not have permission to perform this action"),
      );
    }
    return next();
  };
}
