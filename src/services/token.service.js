import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import config from "../config/env.js";
import Token, { TOKEN_TYPES } from "../models/token.model.js";

// ── Hashing helpers ──────────────────────────────────
// Opaque tokens and OTPs are stored hashed so a DB leak cannot be replayed.
function hash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function parseDurationMs(str) {
  const match = /^(\d+)([smhd])$/.exec(str);
  if (!match) return 0;
  const n = Number(match[1]);
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
  return n * unit;
}

// ── Access token (stateless JWT) ─────────────────────
export function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpires,
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.accessSecret);
}

// ── Refresh token (JWT + hashed DB record for rotation/revocation) ──
export async function createRefreshToken(user) {
  const token = jwt.sign({ sub: user.id }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpires,
  });
  await Token.create({
    user: user.id,
    token: hash(token),
    type: TOKEN_TYPES.REFRESH,
    expiresAt: new Date(
      Date.now() + parseDurationMs(config.jwt.refreshExpires),
    ),
  });
  return token;
}

// Verify signature AND that the token is a live (non-blacklisted) DB record.
export async function verifyRefreshToken(token) {
  const payload = jwt.verify(token, config.jwt.refreshSecret);
  const record = await Token.findOne({
    token: hash(token),
    type: TOKEN_TYPES.REFRESH,
    blacklisted: false,
  });
  if (!record) throw new Error("Refresh token not recognized");
  return { payload, record };
}

export async function revokeRefreshToken(token) {
  await Token.deleteOne({ token: hash(token), type: TOKEN_TYPES.REFRESH });
}

// ── One-time codes (email OTP / password reset) ──────
// Returns the RAW value to send by email; only the hash is persisted.
export async function createOtp(
  user,
  type,
  { digits = 6, ttlMinutes = 10 } = {},
) {
  const raw = String(crypto.randomInt(0, 10 ** digits)).padStart(digits, "0");
  await Token.deleteMany({ user: user.id, type }); // one active code per purpose
  await Token.create({
    user: user.id,
    token: hash(raw),
    type,
    expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
  });
  return raw;
}

export async function createResetToken(user, { ttlMinutes = 30 } = {}) {
  const raw = crypto.randomBytes(32).toString("hex");
  await Token.deleteMany({ user: user.id, type: TOKEN_TYPES.RESET_PASSWORD });
  await Token.create({
    user: user.id,
    token: hash(raw),
    type: TOKEN_TYPES.RESET_PASSWORD,
    expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
  });
  return raw;
}

// Consume (verify + delete) a one-time token. Returns the matching record or null.
export async function consumeToken(userId, rawValue, type) {
  const record = await Token.findOne({
    user: userId,
    token: hash(rawValue),
    type,
    expiresAt: { $gt: new Date() },
  });
  if (!record) return null;
  await Token.deleteOne({ _id: record._id });
  return record;
}
