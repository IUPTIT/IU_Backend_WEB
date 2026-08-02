import { isCelebrateError } from "celebrate";
import config from "../config/env.js";
import ApiError from "../utils/ApiError.js";

// 404 for unmatched routes.
export function notFound(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

// Central error handler (registered last, four args).
export function errorHandler(err, _req, res, _next) {
  let statusCode = 500;
  let message = "Internal server error";
  let errors;

  if (isCelebrateError(err)) {
    statusCode = 400;
    message = "Validation failed";
    errors = {};
    for (const [segment, joiError] of err.details.entries()) {
      errors[segment] = joiError.details.map((d) => d.message);
    }
  } else if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = err.errors;
  } else if (err.name === "ValidationError") {
    statusCode = 400; // mongoose validation
    message = err.message;
  } else if (err.code === 11000) {
    statusCode = 409; // mongo duplicate key
    message = "Duplicate value violates a unique constraint";
  }

  if (statusCode >= 500) console.error("[error]", err);

  res.status(statusCode).json({
    success: false,
    message,
    ...(errors ? { errors } : {}),
    ...(config.isProd ? {} : { stack: err.stack }),
  });
}
