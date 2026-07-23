import Anthropic from "@anthropic-ai/sdk";

// Constructed lazily rather than at import time. The AI routes are always
// mounted (see routes/index.ts), so a top-level `new Anthropic(...)` - or a
// top-level throw on a missing key - would take the whole server down at boot
// for a deployment that never uses AI at all, e.g. the Independent-only alpha.
// Failing here instead means the key is only required by the request that
// actually needs it.
let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (client) return client;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY must be set to use AI features");
  }

  client = new Anthropic({ apiKey });
  return client;
}
