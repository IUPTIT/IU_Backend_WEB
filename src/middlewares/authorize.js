import ApiError from "../utils/ApiError.js";
import { hasRole } from "../utils/roles.js";

// Restrict a route to given roles (intersection with user.roles / role).
export default function authorize(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!hasRole(req.user, ...allowedRoles)) {
      return next(ApiError.forbidden("Bạn không có quyền thực hiện thao tác này"));
    }
    return next();
  };
}

/**
 * Middleware đảm bảo Candidate chỉ có quyền thao tác trên chính hồ sơ/booking của mình.
 */
export function authorizeCandidateOwner(req, _res, next) {
  if (!req.user) return next(ApiError.unauthorized());
  if (!hasRole(req.user, "candidate")) {
    return next(ApiError.forbidden("You do not have permission"));
  }

  const targetAppId =
    req.params.applicationId || req.params.id || req.body.applicationId;

  if (
    !req.user.sourceApplicationId ||
    !targetAppId ||
    req.user.sourceApplicationId.toString() !== targetAppId.toString()
  ) {
    return next(ApiError.forbidden("Bạn không có quyền truy cập hồ sơ này"));
  }
  return next();
}
