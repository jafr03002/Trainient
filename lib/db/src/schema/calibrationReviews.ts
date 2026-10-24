import { pgTable, serial, text, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";

// One row per calibration review outcome - the readiness check that ends
// calibration (see api-server/src/lib/calibrationReview.ts). Not a weekly
// check-in: it asks different questions and never touches calories or phase
// timing beyond moving the client into the next phase.
//
// `kind`:
// - "review": the client submitted the review form (day 8-21 of calibration).
// - "auto_exit": nobody passed by the last review day, so the server ended
//   calibration on its own with an AI-written summary (no form answers).
//
// `verdict`:
// - "pass" / "pass_with_notes": calibration ended, `nextProgramId` is the next
//   phase's program row (with any exercise swaps already applied).
// - "extend": not ready yet; calibration keeps running and the review can be
//   taken again from the next day.
// - "paused": the client is ill or injured so they can't train. Decided by the
//   server with no AI call. Calibration stays open (no auto exit) until they
//   say they've recovered, which stamps `resumedAt` and opens a fresh window.
export const calibrationReviewsTable = pgTable("calibration_reviews", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  // The calibration program row that was being reviewed.
  programId: integer("program_id").notNull(),
  kind: text("kind").notNull().default("review"),
  // Day of calibration the review was taken on (day 1 = the start date).
  calibrationDay: integer("calibration_day").notNull(),
  // Review-form answers. Null on auto_exit rows, and the nutrition ones are
  // null on a paused row (the form stops at the illness question).
  illOrInjured: boolean("ill_or_injured"),
  nutritionSustainable: integer("nutrition_sustainable"),
  nutritionFitsSchedule: text("nutrition_fits_schedule"),
  anythingChanged: text("anything_changed"),
  notes: text("notes"),
  // Snapshot of the hard checks (full rotation, weigh-ins, nutrition logs) at
  // submission time, so the verdict stays explainable after more logs land.
  checks: jsonb("checks").notNull(),
  verdict: text("verdict").notNull(),
  reasons: jsonb("reasons").notNull().default([]),
  workOn: jsonb("work_on").notNull().default([]),
  // Swaps that were actually applied to the next phase's program.
  exerciseSwaps: jsonb("exercise_swaps").notNull().default([]),
  messageToUser: text("message_to_user").notNull(),
  nextProgramId: integer("next_program_id"),
  resumedAt: timestamp("resumed_at", { withTimezone: true }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CalibrationReview = typeof calibrationReviewsTable.$inferSelect;
