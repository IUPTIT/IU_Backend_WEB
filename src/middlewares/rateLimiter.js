import rateLimit from "express-rate-limit";

const jsonMessage = (message) => ({ success: false, message });

// Throttle auth endpoints to slow brute-force attempts.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage("Too many attempts. Please try again later."),
});

export const publicReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage(
    "Quá nhiều yêu cầu từ IP của bạn. Vui lòng thử lại sau 1 phút.",
  ),
});

// Public WRITE endpoints (upload, lưu nháp, nộp/sửa/rút đơn).
// Chặt hơn để chống spam, nhưng đủ cho 1 luồng đăng ký nhiều bước
// (2 upload + vài lần lưu nháp + nộp) kể cả khi nhiều SV chung 1 IP NAT.
export const publicWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage(
    "Quá nhiều yêu cầu từ IP của bạn. Vui lòng thử lại sau 1 phút.",
  ),
});
