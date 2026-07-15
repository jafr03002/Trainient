import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// Clerk proxy must come before body parsers (streams raw bytes)
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// Explicit CORS allowlist. Reflecting any origin (`origin: true`) together with
// `credentials: true` would let any website read authenticated responses on a
// logged-in user's behalf, so only known deployment origins are permitted.
// CORS_ALLOWED_ORIGINS is a comma-separated env var for adding custom domains
// without a code change.
const allowedOrigins = new Set(
  [
    "https://traintent.replit.app",
    ...(process.env.CORS_ALLOWED_ORIGINS?.split(",") ?? []),
  ]
    .map((origin) => origin.trim())
    .filter(Boolean),
);

// Matches any localhost / 127.0.0.1 origin on any port. Only honored outside
// production, so it can never widen the live deployment's surface.
const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      // `origin` is undefined for same-origin and non-browser (server-to-server)
      // requests; allow those.
      if (!origin) {
        callback(null, true);
        return;
      }
      // Outside production, allow any local dev-server port (24301, 24302, ...)
      // without having to enumerate them here.
      if (process.env.NODE_ENV !== "production" && LOCALHOST_ORIGIN.test(origin)) {
        callback(null, true);
        return;
      }
      // Production (and any non-localhost origin): explicit allowlist only.
      callback(null, allowedOrigins.has(origin));
    },
  }),
);

// Raw body for Stripe webhooks - must be before express.json()
app.use(
  "/api/subscriptions/webhook",
  express.raw({ type: "application/json" }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

export default app;
