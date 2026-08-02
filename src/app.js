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

// Global middleware
app.use(helmet());
app.use(cors({ origin: config.clientUrl, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
if (!config.isProd) app.use(morgan("dev"));
app.use(initPassport().initialize()); // stateless; we issue our own JWTs

// Routes
app.use("/api/v1", routes);

// Error handling (last)
app.use(notFound);
app.use(errorHandler);

export default app;
