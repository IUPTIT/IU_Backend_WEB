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

/**
 * Middleware đảm bảo Candidate chỉ có quyền thao tác trên chính hồ sơ/booking của mình.
 * Kiểm tra role candidate và đối chiếu sourceApplicationId với applicationId trong req.params hoặc req.body.
 */
export function authorizeCandidateOwner(req, _res, next) {
  if (!req.user) return next(ApiError.unauthorized());
  if (req.user.role !== "candidate") {
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

