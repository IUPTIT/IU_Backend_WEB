import { Router } from "express";
import passport from "../config/passport.js";
import config from "../config/env.js";
import { authLimiter } from "../middlewares/rateLimiter.js";
import authenticate from "../middlewares/authenticate.js";
import * as authController from "../controllers/auth.controller.js";
import {
  registerValidator,
  verifyEmailValidator,
  resendOtpValidator,
  loginValidator,
  changePasswordValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
} from "../validators/auth.validator.js";

const router = Router();

// Chỉ throttle các endpoint nhập credential (chống brute-force).
// refresh/logout/me là request nền của phiên hợp lệ — không giới hạn,
// nếu không mỗi lần reload trang sẽ ăn dần quota và dính 429 oan.
router.post("/register", authLimiter, registerValidator, authController.register);
router.post("/verify-email", authLimiter, verifyEmailValidator, authController.verifyEmail);
router.post("/resend-otp", authLimiter, resendOtpValidator, authController.resendOtp);
router.post("/login", authLimiter, loginValidator, authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.post(
  "/forgot-password",
  authLimiter,
  forgotPasswordValidator,
  authController.forgotPassword,
);
router.post(
  "/reset-password",
  authLimiter,
  resetPasswordValidator,
  authController.resetPassword,
);

router.get("/me", authenticate, authController.me);
router.post(
  "/change-password",
  authenticate,
  changePasswordValidator,
  authController.changePassword,
);

// Google SSO (only when configured).
if (config.google.enabled) {
  router.get(
    "/google",
    passport.authenticate("google", {
      session: false,
      scope: ["profile", "email"],
    }),
  );
  router.get(
    "/google/callback",
    passport.authenticate("google", {
      session: false,
      failureRedirect: `${config.clientUrl}/login`,
    }),
    authController.googleCallback,
  );
}

export default router;
