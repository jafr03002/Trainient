import { drizzle as drizzleNeon, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import pg from "pg";
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

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// The Neon serverless driver reaches Postgres through Neon's WebSocket proxy, so
// it can't connect to a plain local Postgres over raw TCP. For local dev, where
// DATABASE_URL points at localhost, fall back to the node-postgres TCP driver;
// every deployed environment (Neon on Vercel) keeps using the serverless driver
// unchanged. node-postgres also implements interactive transactions, so the
// account-deletion route works on both paths. The two drizzle instances share
// the same query API, so the local one is cast to the deployed type to keep a
// single `db` type across the codebase.
const isLocalPostgres = /@(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(
  connectionString,
);

export const pool = isLocalPostgres
  ? new pg.Pool({ connectionString })
  : new NeonPool({ connectionString });

export const db: NeonDatabase<typeof schema> = isLocalPostgres
  ? (drizzlePg(pool as pg.Pool, { schema }) as unknown as NeonDatabase<typeof schema>)
  : drizzleNeon(pool as NeonPool, { schema });

export * from "./schema";
