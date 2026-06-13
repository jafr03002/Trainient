import { pgTable, serial, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const programsTable = pgTable("programs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  weekNumber: integer("week_number").notNull(),
  programName: text("program_name").notNull(),
  splitType: text("split_type").notNull(),
  aiNotes: text("ai_notes").notNull().default(""),
  days: jsonb("days").notNull().default([]),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
});

export const insertProgramSchema = createInsertSchema(programsTable).omit({ id: true, generatedAt: true });
export type InsertProgram = z.infer<typeof insertProgramSchema>;
export type Program = typeof programsTable.$inferSelect;
