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
import { errorHandler } from "./middlewares/errorHandler";
import { logger } from "./lib/logger";
import { ALLOWED_ORIGINS, warnIfOriginsLookUnconfigured } from "./lib/domains";

const app: Express = express();

// Behind Replit's edge proxy. Trust one hop so Express derives req.ip / protocol
// from the proxy-set X-Forwarded-* headers instead of leaving them client-
// spoofable. A single numeric hop means an over-count (should Replit add more
// hops) yields a non-spoofable internal IP rather than a client-controlled one.
app.set("trust proxy", 1);

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
// The allowlist (canonical Replit host + CORS_ALLOWED_ORIGINS custom domains)
// lives in ./lib/domains so the Clerk proxy validates hosts against the same
// source of truth.

// Matches any localhost / 127.0.0.1 origin on any port. Only honored outside
// production, so it can never widen the live deployment's surface.
const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

warnIfOriginsLookUnconfigured((msg) => logger.warn(msg));

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
      callback(null, ALLOWED_ORIGINS.has(origin));
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

// Must be registered last so it catches errors from everything above.
app.use(errorHandler);

export default app;
