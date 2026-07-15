import app from "./app";
import { logger } from "./lib/logger";

// A rejected promise that no request is waiting on would otherwise crash the
// process (Node's default) and take the API down for everyone. Log it and
// keep serving; per-request errors are handled by the Express error handler.
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});

// After an uncaught exception the process state can't be trusted, so log it
// and exit; the process manager restarts the server with a clean slate.
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception, shutting down");
  process.exit(1);
});

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
