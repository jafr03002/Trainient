import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dailyLogsTable = pgTable(
  "daily_logs",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    date: text("date").notNull(),
    calories: integer("calories"),
    steps: integer("steps"),
    cardioType: text("cardio_type"),
    cardioMinutes: integer("cardio_minutes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("daily_logs_user_date_idx").on(table.userId, table.date)],
);

export const insertDailyLogSchema = createInsertSchema(dailyLogsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDailyLog = z.infer<typeof insertDailyLogSchema>;
export type DailyLog = typeof dailyLogsTable.$inferSelect;
