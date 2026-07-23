/**
 * Deployment-level feature switches.
 *
 * These gate whole product surfaces, not per-user entitlements - a user's
 * `mode` still decides which lineage they train in, but a flag that's off here
 * means the surface isn't available to anyone on this deployment.
 */

/**
 * AI Coach mode: program generation and the weekly check-in.
 *
 * Off by default, and deliberately opt-in rather than opt-out: the Independent
 * alpha ships with no Anthropic key, and a route that silently starts calling a
 * paid model because an env var was forgotten is the wrong failure direction.
 * Set AI_MODE_ENABLED=true (plus ANTHROPIC_API_KEY) to turn it back on.
 */
export const AI_MODE_ENABLED = process.env.AI_MODE_ENABLED === "true";
