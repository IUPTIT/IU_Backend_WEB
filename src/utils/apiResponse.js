export function sendSuccess(
  res,
  { statusCode = 200, message = "OK", data = null } = {},
) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}
