import config from "../config/env.js";
import catchAsync from "../utils/catchAsync.js";
import { sendSuccess } from "../utils/apiResponse.js";
import * as authService from "../services/auth.service.js";

const REFRESH_COOKIE = "refreshToken";

// httpOnly cookie so the refresh token is not readable by JS (XSS-safe).
const refreshCookieOptions = {
  httpOnly: true,
  secure: config.isProd,
  sameSite: "lax",
  path: "/api/v1/auth",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7d
};

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions);
}

export const register = catchAsync(async (req, res) => {
  const user = await authService.register(req.body);
  sendSuccess(res, {
    statusCode: 201,
    message: "Registered. Check your email for the verification code.",
    data: { user },
  });
});

export const verifyEmail = catchAsync(async (req, res) => {
  const user = await authService.verifyEmail(req.body);
  sendSuccess(res, {
    message: "Email verified. You can now log in.",
    data: { user },
  });
});

export const resendOtp = catchAsync(async (req, res) => {
  await authService.resendOtp(req.body);
  sendSuccess(res, {
    message: "If the account exists, a new code has been sent.",
  });
});

export const login = catchAsync(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.login(req.body);
  setRefreshCookie(res, refreshToken);
  sendSuccess(res, { message: "Logged in", data: { user, accessToken } });
});

export const refresh = catchAsync(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.refresh(
    req.cookies?.[REFRESH_COOKIE],
  );
  setRefreshCookie(res, refreshToken);
  sendSuccess(res, { message: "Token refreshed", data: { user, accessToken } });
});

export const logout = catchAsync(async (req, res) => {
  await authService.logout(req.cookies?.[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, {
    ...refreshCookieOptions,
    maxAge: undefined,
  });
  sendSuccess(res, { message: "Logged out" });
});

export const forgotPassword = catchAsync(async (req, res) => {
  await authService.forgotPassword(req.body);
  sendSuccess(res, {
    message: "If the account exists, a reset link has been sent.",
  });
});

export const resetPassword = catchAsync(async (req, res) => {
  await authService.resetPassword(req.body);
  sendSuccess(res, { message: "Password updated. You can now log in." });
});

// Google callback: passport put the profile on req.user.
export const googleCallback = catchAsync(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.loginWithGoogle(
    req.user,
  );
  setRefreshCookie(res, refreshToken);
  // For a real SPA you would redirect to CLIENT_URL with the token; we return
  // JSON here to keep the scaffold self-contained.
  sendSuccess(res, {
    message: "Logged in with Google",
    data: { user, accessToken },
  });
});

export const me = catchAsync(async (req, res) => {
  sendSuccess(res, { message: "Current user", data: { user: req.user } });
});
