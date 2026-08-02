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
  forgotPasswordValidator,
  resetPasswordValidator,
} from "../validators/auth.validator.js";

const router = Router();

// Throttle all auth endpoints.
router.use(authLimiter);

router.post("/register", registerValidator, authController.register);
router.post("/verify-email", verifyEmailValidator, authController.verifyEmail);
router.post("/resend-otp", resendOtpValidator, authController.resendOtp);
router.post("/login", loginValidator, authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.post(
  "/forgot-password",
  forgotPasswordValidator,
  authController.forgotPassword,
);
router.post(
  "/reset-password",
  resetPasswordValidator,
  authController.resetPassword,
);

router.get("/me", authenticate, authController.me);

// ── Google SSO ───────────────────────────────────────
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
