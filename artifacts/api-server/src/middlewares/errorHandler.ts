import type { ErrorRequestHandler } from "express";

// Global error handler. Express 5 routes both sync throws and rejected
// async handlers here. Logs the full error server-side and returns a
// generic message so stack traces and file paths never reach the client.
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    // Response already partially sent; only Express's default handler can
    // safely close the connection.
    next(err);
    return;
  }

  const status: number =
    typeof err?.statusCode === "number"
      ? err.statusCode
      : typeof err?.status === "number"
        ? err.status
        : 500;

  req.log.error({ err }, "Unhandled request error");

  // `expose` is set by http-errors-style middleware (e.g. body-parser) on
  // client errors whose messages are safe to return.
  const message =
    err?.expose === true && typeof err?.message === "string"
      ? err.message
      : status >= 500
        ? "Internal server error"
        : "Bad request";

  res.status(status).json({ error: message });
};
