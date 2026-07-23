import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const checkinsTable = pgTable("checkins", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  weekNumber: integer("week_number").notNull(),
  energy: integer("energy").notNull(),
  sleep: integer("sleep").notNull(),
  soreness: text("soreness").notNull(),
  // Legacy self-reported "did you complete all sessions?" answer. No longer
  // collected - session adherence is derived from workout_logs instead (see
  // api-server/src/lib/sessionAdherence.ts) - but kept nullable so historic
  // rows stay readable when prior check-ins are shown to the model.
  completion: text("completion"),
  // Server-derived adherence, frozen at check-in time so the judgement stays
  // reproducible after the program regenerates or a session is deleted.
  sessionsPlanned: integer("sessions_planned"),
  sessionsLogged: integer("sessions_logged"),
  // Only asked when sessionsLogged < sessionsPlanned. "forgot_to_log" means the
  // client trained but never logged it - the gap is in logging, not training.
  missedSessionReason: text("missed_session_reason"),
  // Which scale energy/sleep were answered on. Null means the legacy 1-10
  // scale; new rows write 5. Without this, comparing an old "8" to a new "4"
  // week over week reads as a collapse that never happened.
  ratingScaleMax: integer("rating_scale_max"),
  // ti-check-in-engine.md questionnaire. Nullable so drizzle-kit push is safe
  // against pre-existing check-in rows; the form/API layer requires the
  // structured ones (hunger 1-5, off-day deviation) going forward.
  hungerAppetite: integer("hunger_appetite"),
  offDayDeviation: boolean("off_day_deviation"),
  exerciseIssues: text("exercise_issues"),
  wentWell: text("went_well"),
  didntGoWell: text("didnt_go_well"),
  sleepDecline: text("sleep_decline"),
  digestionIssues: text("digestion_issues"),
  notes: text("notes"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCheckinSchema = createInsertSchema(checkinsTable).omit({ id: true, submittedAt: true });
export type InsertCheckin = z.infer<typeof insertCheckinSchema>;
export type Checkin = typeof checkinsTable.$inferSelect;
