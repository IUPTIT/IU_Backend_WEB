import rateLimit from "express-rate-limit";

// Throttle auth endpoints to slow brute-force attempts.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many attempts. Please try again later.",
  },
});

// Strict rate limit for public unauthenticated endpoints (e.g., guest application submissions).
export const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Quá nhiều yêu cầu từ IP của bạn. Vui lòng thử lại sau 1 phút.",
  },
});

