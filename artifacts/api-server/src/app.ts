import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import router from "./routes";
import { errorHandler } from "./middlewares/errorHandler";
import { logger } from "./lib/logger";
import { ALLOWED_ORIGINS } from "./lib/domains";

const app: Express = express();

// Behind a platform edge proxy (Vercel in production, the Vite dev server
// locally). Trust one hop so Express derives req.ip / protocol from the
// proxy-set X-Forwarded-* headers instead of leaving them client-spoofable. A
// single numeric hop means an over-count yields a non-spoofable internal IP
// rather than a client-controlled one.
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

// Explicit CORS allowlist. Reflecting any origin (`origin: true`) together with
// `credentials: true` would let any website read authenticated responses on a
// logged-in user's behalf, so only known deployment origins are permitted.
// In the Vercel deployment the API is served same-origin with the frontend, so
// browser requests aren't cross-origin and this allowlist only ever matters for
// a genuine third-party origin. Extra origins come from CORS_ALLOWED_ORIGINS
// (see ./lib/domains).

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

// Standard Clerk middleware: reads CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY
// from the environment. (The old host-derived publishable-key selection only
// existed to serve Replit's Clerk FAPI proxy across multiple hostnames; with a
// single owned Clerk instance the env keys are all that's needed.)
app.use(clerkMiddleware());

app.use("/api", router);

// Must be registered last so it catches errors from everything above.
app.use(errorHandler);

export default app;
