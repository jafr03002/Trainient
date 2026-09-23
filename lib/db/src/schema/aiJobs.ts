import { sql } from "drizzle-orm";
import { pgTable, uuid, text, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// One row per asynchronous AI request (program generation, weekly check-in).
// The API runs as a stateless serverless function, so a job's progress has to
// live here rather than in memory: the invocation that does the work writes the
// row, and whichever invocation serves the client's poll reads it.
//
// `status` moves pending -> running -> succeeded | failed. `result` holds the
// exact response body the blocking endpoint would have returned, so a client
// that polls a finished job gets the same shape either way.
export const aiJobsTable = pgTable(
  "ai_jobs",
  {
    // A uuid rather than a serial: the id is handed to the client and polled
    // by it, so it must not be guessable or reveal how many jobs exist.
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("pending"),
    requestPayload: jsonb("request_payload").notNull(),
    result: jsonb("result"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    // At most one unfinished job per user per kind. A phone that retries a POST
    // after a dropped connection gets the job already in flight back instead of
    // paying for a second generation (or, for a check-in, writing a second
    // check-in and a second program). Enforced here, not just checked in code,
    // so two simultaneous POSTs can't both win.
    uniqueIndex("ai_jobs_one_active_per_kind_idx")
      .on(table.userId, table.kind)
      .where(sql`status in ('pending', 'running')`),
  ],
);

export type AiJob = typeof aiJobsTable.$inferSelect;
