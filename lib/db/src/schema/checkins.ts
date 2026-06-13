import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
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
  notes: text("notes"),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
});

export const insertCheckinSchema = createInsertSchema(checkinsTable).omit({ id: true, submittedAt: true });
export type InsertCheckin = z.infer<typeof insertCheckinSchema>;
export type Checkin = typeof checkinsTable.$inferSelect;
