/**
 * Clerk Frontend API Proxy Middleware
 *
 * Proxies Clerk Frontend API requests through your domain, enabling Clerk
 * authentication on custom domains and .replit.app deployments without
 * requiring CNAME DNS configuration.
 *
 * AUTH CONFIGURATION: To manage users, enable/disable login providers
 * (Google, GitHub, etc.), change app branding, or configure OAuth credentials,
 * use the Auth pane in the workspace toolbar. There is no external Clerk
 * dashboard - all auth configuration is done through the Auth pane.
 *
 * IMPORTANT:
 * - Only active in production (Clerk proxying doesn't work for dev instances)
 * - Must be mounted BEFORE express.json() middleware
 *
 * Usage in app.ts:
 *   import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";
 *   app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
 */

import { createProxyMiddleware } from "http-proxy-middleware";
import type { Request, RequestHandler } from "express";
import type { IncomingHttpHeaders } from "http";
import { ALLOWED_HOSTS } from "../lib/domains";

const CLERK_FAPI = "https://frontend-api.clerk.dev";
export const CLERK_PROXY_PATH = "/api/__clerk";

/**
 * Returns the effective public hostname for the given request, preferring
 * x-forwarded-host over the Host header so callers behind a proxy see the
 * original client-facing host.
 *
 * x-forwarded-host can take three shapes:
 *   - undefined (no proxy involved)
 *   - a single string (one proxy hop)
 *   - a comma-delimited string when an upstream appended rather than
 *     replaced the header (Node folds duplicate headers this way), or a
 *     string[] in some Express typings
 * In the multi-value case, the leftmost value is the original client-
 * facing host. Take that one in all forms.
 *
 * SECURITY: x-forwarded-host (and Host) are client-controllable when a request
 * reaches us directly instead of through Replit's edge proxy. Trusting a forged
 * value would let a caller pick which Clerk instance we select
 * (publishableKeyFromHost) and which Clerk-Proxy-Url we report upstream. In
 * production we therefore only return a candidate host that matches an ALLOWED_HOSTS
 * entry (canonical Replit host + CORS_ALLOWED_ORIGINS custom domains) and return
 * undefined otherwise, so both call sites fall back to safe defaults. Outside
 * production the observed host is returned unchanged for local dev / tests.
 *
 * Exported so that app.ts (clerkMiddleware callback) and this proxy middleware
 * agree on which hostname is canonical - otherwise multi-domain/custom-domain
 * flows break.
 */
export function getClerkProxyHost(req: {
  headers: IncomingHttpHeaders;
}): string | undefined {
  const forwarded = req.headers["x-forwarded-host"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const firstHop = raw?.split(",")[0]?.trim();
  const candidate = firstHop || req.headers.host?.trim() || undefined;

  // Outside production the proxy is bypassed anyway; trust the observed host so
  // local dev servers and tests keep working.
  if (process.env.NODE_ENV !== "production") {
    return candidate;
  }

  // Production: only trust a host we actually deploy on; ignore anything else.
  return candidate && ALLOWED_HOSTS.has(candidate) ? candidate : undefined;
}

export function clerkProxyMiddleware(): RequestHandler {
  // Only run proxy in production - Clerk proxying doesn't work for dev instances
  if (process.env.NODE_ENV !== "production") {
    return (_req, _res, next) => next();
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    return (_req, _res, next) => next();
  }

  return createProxyMiddleware({
    target: CLERK_FAPI,
    changeOrigin: true,
    pathRewrite: (path: string) =>
      path.replace(new RegExp(`^${CLERK_PROXY_PATH}`), ""),
    on: {
      proxyReq: (proxyReq, req) => {
        const protocol = req.headers["x-forwarded-proto"] || "https";
        const host = getClerkProxyHost(req) || "";
        const proxyUrl = `${protocol}://${host}${CLERK_PROXY_PATH}`;

        proxyReq.setHeader("Clerk-Proxy-Url", proxyUrl);
        proxyReq.setHeader("Clerk-Secret-Key", secretKey);

        // Forward the framework-derived client IP rather than the raw
        // x-forwarded-for the caller sent. With `trust proxy` set in app.ts,
        // Express strips the trusted hop and computes a de-spoofed req.ip, so a
        // caller can't frame another IP or dodge Clerk's IP-based rate limiting.
        const clientIp = (req as Request).ip || req.socket?.remoteAddress || "";
        if (clientIp) {
          proxyReq.setHeader("X-Forwarded-For", clientIp);
        }
      },
    },
  }) as RequestHandler;
}
