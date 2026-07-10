import { pgTable, serial, text, integer, jsonb, boolean, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const programsTable = pgTable("programs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  weekNumber: integer("week_number").notNull(),
  programName: text("program_name").notNull(),
  splitType: text("split_type").notNull(),
  programHighlights: jsonb("program_highlights").notNull().default([]),
  days: jsonb("days").notNull().default([]),
  // AI-generated program monitoring - nullable since manual/Independent-mode
  // programs (no AI involved) and pre-existing rows never populate these.
  longTermPhase: text("long_term_phase"),
  shortTermPhase: text("short_term_phase"),
  energyBalance: text("energy_balance"),
  trainingWorkload: jsonb("training_workload"),
  longTermGoalWeight: real("long_term_goal_weight"),
  shortTermGoalWeight: real("short_term_goal_weight"),
  dailyStepTarget: text("daily_step_target"),
  cardioIntensity: jsonb("cardio_intensity"),
  // Server-internal phase-template bookkeeping (see lib/phaseTemplate.ts) -
  // which hard-template segment the client is in and how many weeks they've
  // been there. Never returned to clients (stripped in serializeProgram).
  phaseSegmentIndex: integer("phase_segment_index"),
  weeksInPhaseSegment: integer("weeks_in_phase_segment"),
  aiGenerated: boolean("ai_generated").notNull().default(true),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
});

export const insertProgramSchema = createInsertSchema(programsTable).omit({ id: true, generatedAt: true });
export type InsertProgram = z.infer<typeof insertProgramSchema>;
export type Program = typeof programsTable.$inferSelect;
