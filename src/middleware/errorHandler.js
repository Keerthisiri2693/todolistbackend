
export function errorHandler(err, req, res, next) {
  console.error("BACKEND ERROR:", err);

  // Response already sent - do not send another response
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || err.status || 500;

  const message =
    statusCode >= 500
      ? "Internal Server Error"
      : err.message || "Something went wrong";

  return res.status(statusCode).json({
    success: false,
    error: message,
  });
}
