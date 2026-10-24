import { pgTable, serial, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const workoutLogsTable = pgTable("workout_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  date: text("date").notNull(),
  dayNumber: integer("day_number").notNull(),
  weekNumber: integer("week_number").notNull(),
  dayLabel: text("day_label"),
  mode: text("mode").notNull().default("ai"),
  // "calibration": a calibration-phase session, where sets are ticked off with
  // no weight or reps. The server only accepts it during a calibration week.
  loggingMode: text("logging_mode").notNull().default("full"),
  // The short questionnaire after a calibration session (equipment found, form
  // confidence, pain, overall feel) - evidence for the calibration review.
  // Only accepted on calibration logs; null everywhere else.
  calibrationFeedback: jsonb("calibration_feedback"),
  exercisesLogged: jsonb("exercises_logged").notNull().default([]),
  // Wall-clock session timing: the clock runs from the moment the log page
  // opens to the moment Finish is tapped. Both nullable - sessions logged
  // before this existed have neither.
  startedAt: timestamp("started_at", { withTimezone: true }),
  durationSeconds: integer("duration_seconds"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWorkoutLogSchema = createInsertSchema(workoutLogsTable).omit({ id: true, createdAt: true });
export type InsertWorkoutLog = z.infer<typeof insertWorkoutLogSchema>;
export type WorkoutLog = typeof workoutLogsTable.$inferSelect;
