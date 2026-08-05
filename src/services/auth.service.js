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

/** Chặn tài khoản đã vô hiệu hoá (login / refresh / Google) */
function assertAccountActive(user) {
  if (!user || user.status === "disabled" || user.isActive === false) {
    throw ApiError.forbidden("Tài khoản đã bị vô hiệu hoá");
  }
}

/**
 * Đăng ký công khai tắt — tài khoản Member chỉ tạo qua luồng tuyển
 * (Pass vòng đơn → Candidate → Trúng tuyển → Member).
 */
export async function register() {
  throw ApiError.forbidden(
    "Hệ thống không mở đăng ký công khai. Tài khoản được tạo qua quy trình tuyển thành viên IU CLUB.",
  );
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
  assertAccountActive(user);
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

  // Rotation: revoke token đã dùng trước — kể cả khi account disabled
  await tokenService.revokeRefreshToken(oldRefreshToken);

  if (user.status === "disabled" || user.isActive === false) {
    await tokenService.revokeAllRefreshTokens(user.id);
    throw ApiError.forbidden("Tài khoản đã bị vô hiệu hoá");
  }

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

/**
 * Google SSO: chỉ đăng nhập / liên kết tài khoản ĐÃ tồn tại
 * (Candidate/Member/Leader/BCN). Không tự tạo Member mới.
 */
export async function loginWithGoogle(profile) {
  const email = profile.emails?.[0]?.value?.toLowerCase();
  if (!email) throw ApiError.badRequest("Google account has no email");

  const user = await User.findOne({ $or: [{ googleId: profile.id }, { email }] });
  if (!user) {
    throw ApiError.forbidden(
      "Tài khoản chưa tồn tại. Vui lòng hoàn tất quy trình tuyển thành viên trước khi đăng nhập Google.",
    );
  }

  assertAccountActive(user);

  if (!user.googleId) {
    user.googleId = profile.id;
    user.emailVerified = true;
    if (user.status === "pending") user.status = "active";
    await user.save();
  }

  const tokens = await issueTokens(user);
  return { user, ...tokens };
}
