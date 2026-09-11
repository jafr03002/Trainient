import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger";

// Constructed lazily rather than at import time. The AI routes are always
// mounted (see routes/index.ts), so a top-level `new Anthropic(...)` - or a
// top-level throw on a missing key - would take the whole server down at boot.
// On a serverless platform that means a cold start that crashes instead of
// serving, e.g. if the key is momentarily unset or misconfigured. Failing here
// instead means the key is only required by the request that actually needs it.
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

// The one model every AI decision in this app runs on. Program generation and
// the weekly check-in share it (and the request shape below) so they can't
// drift onto different models or settings by accident.
export const COACH_MODEL = "claude-opus-5";

// One structured-output call: the static system prompt (persona + knowledge
// docs) is identical for every user, so it carries the prompt-cache breakpoint;
// everything per-user goes in the user message after it. Returns the parsed
// JSON, which the json_schema output format guarantees matches `schema`.
export async function generateStructured(args: {
  // Names the decision in logs and error messages, e.g. "program-generation".
  purpose: string;
  system: string;
  prompt: string;
  schema: { [key: string]: unknown };
}): Promise<any> {
  const completion = await getAnthropic().messages.create({
    model: COACH_MODEL,
    // A ceiling, not a target: billing is for tokens actually produced. It has
    // to cover adaptive thinking AND the full program JSON. A 4-day program
    // measured 3529 output tokens on claude-opus-5, which left 4000 too little
    // headroom before the JSON got cut off. 16000 stays well inside what the SDK
    // allows without streaming.
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: [{ type: "text", text: args.system, cache_control: { type: "ephemeral" } }],
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: args.schema },
    },
    messages: [{ role: "user", content: args.prompt }],
  });

  // Token usage including cache reads - the quickest way to see whether the
  // static-prompt cache is actually being hit in production.
  logger.info({ purpose: args.purpose, stopReason: completion.stop_reason, usage: completion.usage }, "Claude call finished");

  // Both of these would otherwise surface as an opaque JSON.parse failure on a
  // truncated or empty body.
  if (completion.stop_reason === "refusal") {
    throw new Error(`Claude declined the ${args.purpose} request`);
  }
  if (completion.stop_reason === "max_tokens") {
    throw new Error(`Claude's ${args.purpose} response hit max_tokens before the JSON was complete`);
  }

  const textBlock = completion.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`Expected a text block in Claude's ${args.purpose} response`);
  }
  return JSON.parse(textBlock.text);
}
