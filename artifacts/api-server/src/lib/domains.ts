/**
 * The deployment's known-good cross-origin allowlist.
 *
 * On Vercel the API is served same-origin with the frontend, so browser
 * requests are not cross-origin and this list is only consulted for genuine
 * third-party origins. Add any such origin (e.g. a separate marketing domain)
 * via the comma-separated CORS_ALLOWED_ORIGINS env var - no code change needed.
 */
const rawOrigins = (process.env.CORS_ALLOWED_ORIGINS?.split(",") ?? [])
  .map((origin) => origin.trim())
  .filter(Boolean);

/** Origins the CORS middleware will reflect for credentialed requests. */
export const ALLOWED_ORIGINS = new Set(rawOrigins);
