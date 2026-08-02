import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import config from "./config/env.js";
import { initPassport } from "./config/passport.js";
import routes from "./routes/index.js";
import { notFound, errorHandler } from "./middlewares/error.js";

const app = express();

// ── Global middleware ────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: config.clientUrl,
    credentials: true, // allow the refresh-token cookie
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
if (!config.isProd) app.use(morgan("dev"));

// Passport in stateless mode (no sessions; we issue our own JWTs).
app.use(initPassport().initialize());

// ── Routes ───────────────────────────────────────────
app.use("/api/v1", routes);

// ── Error handling (must come last) ──────────────────
app.use(notFound);
app.use(errorHandler);

export default app;
