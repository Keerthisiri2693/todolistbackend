
export function errorHandler(err, req, res, next) {
  console.error("BACKEND ERROR:", {
    method: req.method,
    url: req.originalUrl,
    message: err.message,
    code: err.code,
    stack: err.stack,
  });

  // If response was already sent, delegate to Express default handler.
  if (res.headersSent) {
    return next(err);
  }

  let statusCode =
    err.statusCode || err.status || 500;

  if (!Number.isInteger(statusCode) || statusCode < 400 || statusCode > 599) {
    statusCode = 500;
  }

  const message =
    statusCode >= 500
      ? "Internal Server Error"
      : err.message || "Something went wrong";

  return res.status(statusCode).json({
    success: false,
    error: message,
  });
}
