import dotenv from "dotenv";
import Joi from "joi";

dotenv.config();

// Validate env once at startup; fail fast on missing/invalid vars.
const schema = Joi.object({
  NODE_ENV: Joi.string()
    .valid("development", "production", "test")
    .default("development"),
  PORT: Joi.number().default(5000),
  CLIENT_URL: Joi.string().uri().default("http://localhost:3000"),

  MONGODB_URI: Joi.string().required(),

  JWT_ACCESS_SECRET: Joi.string().required(),
  JWT_REFRESH_SECRET: Joi.string().required(),
  JWT_ACCESS_EXPIRES: Joi.string().default("15m"),
  JWT_REFRESH_EXPIRES: Joi.string().default("7d"),

  GOOGLE_CLIENT_ID: Joi.string().allow("").default(""),
  GOOGLE_CLIENT_SECRET: Joi.string().allow("").default(""),
  GOOGLE_CALLBACK_URL: Joi.string()
    .uri()
    .default("http://localhost:5000/api/v1/auth/google/callback"),

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

const config = {
  env: envVars.NODE_ENV,
  isProd: envVars.NODE_ENV === "production",
  port: envVars.PORT,
  clientUrl: envVars.CLIENT_URL,

  mongoUri: envVars.MONGODB_URI,

  jwt: {
    accessSecret: envVars.JWT_ACCESS_SECRET,
    refreshSecret: envVars.JWT_REFRESH_SECRET,
    accessExpires: envVars.JWT_ACCESS_EXPIRES,
    refreshExpires: envVars.JWT_REFRESH_EXPIRES,
  },

  google: {
    clientId: envVars.GOOGLE_CLIENT_ID,
    clientSecret: envVars.GOOGLE_CLIENT_SECRET,
    callbackUrl: envVars.GOOGLE_CALLBACK_URL,
    get enabled() {
      return Boolean(this.clientId && this.clientSecret);
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
};

export default config;
