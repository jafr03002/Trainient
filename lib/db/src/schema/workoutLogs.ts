import { pgTable, serial, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const workoutLogsTable = pgTable("workout_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  date: text("date").notNull(),
  dayNumber: integer("day_number").notNull(),
  weekNumber: integer("week_number").notNull(),
  exercisesLogged: jsonb("exercises_logged").notNull().default([]),
  durationMinutes: integer("duration_minutes"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertWorkoutLogSchema = createInsertSchema(workoutLogsTable).omit({ id: true, createdAt: true });
export type InsertWorkoutLog = z.infer<typeof insertWorkoutLogSchema>;
export type WorkoutLog = typeof workoutLogsTable.$inferSelect;
