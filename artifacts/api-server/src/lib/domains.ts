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

/**
 * Deploying to any origin other than the hardcoded canonical one without
 * setting CORS_ALLOWED_ORIGINS produces a confusing failure: the app loads
 * (it's served statically) but every API call is CORS-blocked and sign-in
 * breaks, because this same list gates the Clerk proxy's x-forwarded-host
 * check. Neither symptom points at this env var, so say so loudly at boot.
 *
 * Deliberately a warning, not a throw: the canonical origin is a legitimate
 * configuration, and refusing to start would be worse than a noisy log.
 */
export function warnIfOriginsLookUnconfigured(
  log: (msg: string) => void,
): void {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.CORS_ALLOWED_ORIGINS?.trim()) return;

  log(
    "CORS_ALLOWED_ORIGINS is not set - only " +
      [...ALLOWED_ORIGINS].join(", ") +
      " will be accepted. If this deployment is served from any other domain, " +
      "API calls and Clerk sign-in will fail until that origin is added.",
  );
}
