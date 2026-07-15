import { pgTable, serial, text, real, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bodyweightLogsTable = pgTable(
  "bodyweight_logs",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    date: text("date").notNull(),
    weight: real("weight").notNull(),
    weightUnit: text("weight_unit").notNull().default("kg"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("bodyweight_logs_user_date_idx").on(table.userId, table.date)],
);

export const insertBodyweightLogSchema = createInsertSchema(bodyweightLogsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBodyweightLog = z.infer<typeof insertBodyweightLogSchema>;
export type BodyweightLog = typeof bodyweightLogsTable.$inferSelect;
