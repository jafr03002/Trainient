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
// without a code change; localhost is allowed only outside production.
const allowedOrigins = new Set(
  [
    "https://traintent.replit.app",
    ...(process.env.CORS_ALLOWED_ORIGINS?.split(",") ?? []),
    ...(process.env.NODE_ENV !== "production"
      ? ["http://localhost:8080", "http://localhost:5173"]
      : []),
  ]
    .map((origin) => origin.trim())
    .filter(Boolean),
);

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      // `origin` is undefined for same-origin and non-browser (server-to-server)
      // requests; allow those. Otherwise the origin must be on the allowlist.
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
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
