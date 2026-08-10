import ApiError from "../utils/ApiError.js";

/**
 * Chặn thao tác khi tài khoản còn cờ bắt buộc đổi mật khẩu
 * (ứng viên vừa Pass vòng đơn — nghiệp vụ Phần 3.2).
 */
export default function requirePasswordChanged(req, _res, next) {
  if (req.user?.requirePasswordChange) {
    return next(
      ApiError.forbidden(
        "Vui lòng đổi mật khẩu trước khi tiếp tục sử dụng hệ thống",
      ),
    );
  }
  return next();
}
