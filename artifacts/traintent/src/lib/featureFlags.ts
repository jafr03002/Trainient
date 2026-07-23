/**
 * Client-side mirror of the server's AI_MODE_ENABLED switch
 * (api-server/src/lib/featureFlags.ts).
 *
 * A plain constant rather than an `import.meta.env` lookup on purpose: a
 * build-time env var that silently defaults to "off" when someone forgets to
 * set it is exactly the footgun this is meant to prevent. Flipping AI back on
 * is a one-line change here plus AI_MODE_ENABLED=true on the server.
 *
 * This gates *presentation* only - what gets shown or offered. The server
 * refuses the AI endpoints independently, and that refusal is the actual
 * security boundary.
 */
// Annotated `boolean` rather than inferred as the literal `false`: without it
// TypeScript narrows every guarded branch to unreachable, so flipping this to
// true could surface type errors that were invisible while it was off.
export const AI_MODE_ENABLED: boolean = false;
