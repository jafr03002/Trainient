/**
 * Single source of truth for the deployment's known-good origins and hosts.
 *
 * Both the CORS allowlist (which reflects origins) and the Clerk proxy (which
 * must validate the client-supplied `x-forwarded-host` before trusting it) are
 * derived from the same list, so a custom production domain only has to be
 * added in one place - via the CORS_ALLOWED_ORIGINS env var - to be honored by
 * both.
 */

// Full origins (scheme + host) permitted in production. The canonical Replit
// deployment is always allowed; CORS_ALLOWED_ORIGINS is a comma-separated env
// var for adding custom domains without a code change.
const rawOrigins = [
  "https://traintent.replit.app",
  ...(process.env.CORS_ALLOWED_ORIGINS?.split(",") ?? []),
]
  .map((origin) => origin.trim())
  .filter(Boolean);

/** Origins reflected by the CORS middleware. */
export const ALLOWED_ORIGINS = new Set(rawOrigins);

/**
 * Hostnames (`hostname[:port]`) extracted from the allowed origins. Used to
 * validate the `x-forwarded-host` header a caller supplies before it is trusted
 * to select the Clerk instance or build the upstream proxy URL.
 */
export const ALLOWED_HOSTS = new Set(
  rawOrigins.flatMap((origin) => {
    try {
      return [new URL(origin).host];
    } catch {
      return [];
    }
  }),
);
