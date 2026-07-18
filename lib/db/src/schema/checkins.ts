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
  completion: text("completion").notNull(),
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
