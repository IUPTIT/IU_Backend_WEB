import ApiError from "../utils/ApiError.js";
import User from "../models/user.model.js";
import { TOKEN_TYPES } from "../models/token.model.js";
import * as tokenService from "./token.service.js";
import * as emailService from "./email.service.js";

async function issueTokens(user) {
  const accessToken = tokenService.signAccessToken(user);
  const refreshToken = await tokenService.createRefreshToken(user);
  return { accessToken, refreshToken };
}

export async function register({ name, email, password }) {
  const existing = await User.findOne({ email });
  if (existing) throw ApiError.conflict("Email is already registered");

  const user = await User.create({
    name,
    email,
    password,
    role: "member",
    status: "pending",
  });

  const otp = await tokenService.createOtp(user, TOKEN_TYPES.VERIFY_EMAIL);
  await emailService.sendVerificationEmail(user.email, otp);

  return user;
}

export async function verifyEmail({ email, otp }) {
  const user = await User.findOne({ email });
  if (!user) throw ApiError.badRequest("Invalid verification request");

  const record = await tokenService.consumeToken(
    user.id,
    otp,
    TOKEN_TYPES.VERIFY_EMAIL,
  );
  if (!record)
    throw ApiError.badRequest("Invalid or expired verification code");

  user.emailVerified = true;
  user.status = "active";
  await user.save();
  return user;
}

export async function resendOtp({ email }) {
  const user = await User.findOne({ email });
  if (!user || user.emailVerified) return; // don't reveal existence
  const otp = await tokenService.createOtp(user, TOKEN_TYPES.VERIFY_EMAIL);
  await emailService.sendVerificationEmail(user.email, otp);
}

export async function login({ email, password }) {
  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized("Invalid email or password");
  }
  if (user.status === "disabled")
    throw ApiError.forbidden("Account is disabled");
  if (!user.emailVerified) throw ApiError.forbidden("Email not verified");

  const tokens = await issueTokens(user);
  return { user, ...tokens };
}

export async function refresh(oldRefreshToken) {
  if (!oldRefreshToken) throw ApiError.unauthorized("Missing refresh token");

  let payload;
  try {
    ({ payload } = await tokenService.verifyRefreshToken(oldRefreshToken));
  } catch {
    throw ApiError.unauthorized("Invalid refresh token");
  }

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized("Invalid refresh token");

  // Rotation: revoke the used token, issue a new pair.
  await tokenService.revokeRefreshToken(oldRefreshToken);
  const tokens = await issueTokens(user);
  return { user, ...tokens };
}

export async function logout(refreshToken) {
  if (refreshToken) await tokenService.revokeRefreshToken(refreshToken);
}

export async function forgotPassword({ email }) {
  const user = await User.findOne({ email });
  if (!user) return; // avoid user enumeration
  const resetToken = await tokenService.createResetToken(user);
  await emailService.sendPasswordResetEmail(user.email, resetToken);
}

export async function resetPassword({ email, token, password }) {
  const user = await User.findOne({ email });
  if (!user) throw ApiError.badRequest("Invalid reset request");

  const record = await tokenService.consumeToken(
    user.id,
    token,
    TOKEN_TYPES.RESET_PASSWORD,
  );
  if (!record) throw ApiError.badRequest("Invalid or expired reset token");

  user.password = password;
  await user.save();
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select("+password");
  if (!user) throw ApiError.unauthorized();

  if (!(await user.comparePassword(currentPassword))) {
    throw ApiError.badRequest("Current password is incorrect");
  }
  if (currentPassword === newPassword) {
    throw ApiError.badRequest("New password must be different");
  }

  user.password = newPassword;
  user.requirePasswordChange = false;
  await user.save();

  // Đổi mật khẩu → thu hồi mọi refresh token cũ, buộc các thiết bị khác đăng nhập lại
  await tokenService.revokeAllRefreshTokens(user.id);
  return issueTokens(user).then((tokens) => ({ user, ...tokens }));
}

export async function loginWithGoogle(profile) {
  const email = profile.emails?.[0]?.value?.toLowerCase();
  if (!email) throw ApiError.badRequest("Google account has no email");

  let user = await User.findOne({ $or: [{ googleId: profile.id }, { email }] });
  if (!user) {
    user = await User.create({
      name: profile.displayName || email,
      email,
      googleId: profile.id,
      avatar: profile.photos?.[0]?.value || "",
      emailVerified: true,
      status: "active",
      role: "member",
    });
  } else if (!user.googleId) {
    // Link Google to an existing local account.
    user.googleId = profile.id;
    user.emailVerified = true;
    if (user.status === "pending") user.status = "active";
    await user.save();
  }

  const tokens = await issueTokens(user);
  return { user, ...tokens };
}
