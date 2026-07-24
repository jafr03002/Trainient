import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as schema from "./schema";

// Neon's serverless driver talks to Postgres over a WebSocket, which lets it
// open connections from a serverless function without exhausting Postgres the
// way a per-invocation TCP pool would. Node has no built-in WebSocket, so the
// driver needs one supplied (browsers provide their own).
//
// This is the WebSocket driver (`neon-serverless`), not the HTTP one
// (`neon-http`): only the WebSocket driver supports interactive transactions,
// which `db.transaction` in the account-deletion route depends on.
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";
