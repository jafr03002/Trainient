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

  const rawStatus: unknown = err?.statusCode ?? err?.status;

  // Only trust real HTTP error codes. Anything else — a stray 200 that would
  // mislabel a fault as success, or an out-of-range value that would make
  // res.status() itself throw — becomes a 500.
  const status =
    typeof rawStatus === "number" &&
    Number.isInteger(rawStatus) &&
    rawStatus >= 400 &&
    rawStatus <= 599
      ? rawStatus
      : 500;

  // Client-caused 4xx (e.g. malformed JSON) is noise at error level and can
  // trip error-rate alerting; reserve error for genuine server faults.
  if (status >= 500) {
    req.log.error({ err }, "Unhandled request error");
  } else {
    req.log.warn({ err }, "Request error");
  }

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
