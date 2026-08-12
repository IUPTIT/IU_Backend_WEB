import dotenv from "dotenv";
import Joi from "joi";

dotenv.config();

// Validate env once at startup; fail fast on missing/invalid vars.
const schema = Joi.object({
  NODE_ENV: Joi.string()
    .valid("development", "production", "test")
    .default("development"),
  PORT: Joi.number().default(5000),
  // Số proxy hop tin cậy để rate-limit lấy đúng IP client (X-Forwarded-For).
  // 0 = tắt (chạy trực tiếp, không proxy). Sau 1 reverse proxy/PaaS: đặt 1.
  TRUST_PROXY: Joi.number().min(0).default(0),
  CLIENT_URL: Joi.string().uri().default("http://localhost:3000"),
  BACKEND_URL: Joi.string().uri().allow("").default(""),

  MONGODB_URI: Joi.string().required(),

  JWT_ACCESS_SECRET: Joi.string().required(),
  JWT_REFRESH_SECRET: Joi.string().required(),
  JWT_ACCESS_EXPIRES: Joi.string().default("15m"),
  JWT_REFRESH_EXPIRES: Joi.string().default("7d"),

  GOOGLE_CLIENT_ID: Joi.string().allow("").default(""),
  GOOGLE_CLIENT_SECRET: Joi.string().allow("").default(""),
  // Bỏ trống = tự suy ra từ BACKEND_URL: ${BACKEND_URL}/api/v1/auth/google/callback
  GOOGLE_CALLBACK_URL: Joi.string().uri().allow("").default(""),

  CLOUDINARY_CLOUD_NAME: Joi.string().allow("").default(""),
  CLOUDINARY_API_KEY: Joi.string().allow("").default(""),
  CLOUDINARY_API_SECRET: Joi.string().allow("").default(""),

  // SendGrid Web API (ưu tiên trên deploy — tránh SMTP Gmail bị chặn)
  SENDGRID_API_KEY: Joi.string().allow("").default(""),
  EMAIL_FROM: Joi.string().allow("").default(""),

  // SMTP fallback (local / khi chưa có SendGrid)
  SMTP_HOST: Joi.string().allow("").default(""),
  SMTP_PORT: Joi.number().default(587),
  SMTP_USER: Joi.string().allow("").default(""),
  SMTP_PASS: Joi.string().allow("").default(""),
  SMTP_FROM: Joi.string().default("IU_CLUB <no-reply@iuclub.dev>"),
})
  .unknown()
  .required();

const { value: envVars, error } = schema.validate(process.env, {
  abortEarly: false,
});

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

/** Tránh mongodb+srv querySrv ECONNREFUSED trên một số DNS Windows */
function expandMongoSrvUri(mongoUri) {
  if (!mongoUri.startsWith("mongodb+srv://")) return mongoUri;
  const parsed = new URL(mongoUri.replace("mongodb+srv://", "https://"));
  const auth =
    parsed.username || parsed.password
      ? `${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password)}@`
      : "";
  const dbPath =
    parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "/";
  const params = new URLSearchParams(parsed.search);
  if (!params.has("authSource")) params.set("authSource", "admin");
  if (!params.has("replicaSet")) {
    params.set("replicaSet", "atlas-58z8f3-shard-0");
  }
  params.set("tls", "true");
  const hosts = [
    "ac-nfptywg-shard-00-00.n3liatt.mongodb.net:27017",
    "ac-nfptywg-shard-00-01.n3liatt.mongodb.net:27017",
    "ac-nfptywg-shard-00-02.n3liatt.mongodb.net:27017",
  ].join(",");
  return `mongodb://${auth}${hosts}${dbPath}?${params.toString()}`;
}

const backendUrl = (
  envVars.BACKEND_URL || `http://localhost:${envVars.PORT}`
).replace(/\/+$/, "");

const googleCallbackUrl =
  envVars.GOOGLE_CALLBACK_URL || `${backendUrl}/api/v1/auth/google/callback`;

const config = {
  env: envVars.NODE_ENV,
  isProd: envVars.NODE_ENV === "production",
  port: envVars.PORT,
  trustProxy: envVars.TRUST_PROXY,
  clientUrl: envVars.CLIENT_URL,
  backendUrl,

  mongoUri: expandMongoSrvUri(envVars.MONGODB_URI),

  jwt: {
    accessSecret: envVars.JWT_ACCESS_SECRET,
    refreshSecret: envVars.JWT_REFRESH_SECRET,
    accessExpires: envVars.JWT_ACCESS_EXPIRES,
    refreshExpires: envVars.JWT_REFRESH_EXPIRES,
  },

  google: {
    clientId: envVars.GOOGLE_CLIENT_ID,
    clientSecret: envVars.GOOGLE_CLIENT_SECRET,
    callbackUrl: googleCallbackUrl,
    get enabled() {
      return Boolean(this.clientId && this.clientSecret);
    },
  },

  cloudinary: {
    cloudName: envVars.CLOUDINARY_CLOUD_NAME,
    apiKey: envVars.CLOUDINARY_API_KEY,
    apiSecret: envVars.CLOUDINARY_API_SECRET,
    get enabled() {
      return Boolean(this.cloudName && this.apiKey && this.apiSecret);
    },
  },

  /** From chung: EMAIL_FROM > SMTP_FROM (phải verify trên SendGrid) */
  emailFrom:
    envVars.EMAIL_FROM || envVars.SMTP_FROM || "IU_CLUB <no-reply@iuclub.dev>",

  sendgrid: {
    apiKey: envVars.SENDGRID_API_KEY,
    get enabled() {
      return Boolean(this.apiKey);
    },
  },

  smtp: {
    host: envVars.SMTP_HOST,
    port: envVars.SMTP_PORT,
    user: envVars.SMTP_USER,
    pass: envVars.SMTP_PASS,
    from: envVars.SMTP_FROM,
    get enabled() {
      return Boolean(this.host && this.user);
    },
  },

  /** Có ít nhất 1 kênh gửi thật (SendGrid ưu tiên) */
  get mailEnabled() {
    return this.sendgrid.enabled || this.smtp.enabled;
  },

  get mailProvider() {
    if (this.sendgrid.enabled) return "sendgrid";
    if (this.smtp.enabled) return "smtp";
    return "console";
  },
};

export default config;
