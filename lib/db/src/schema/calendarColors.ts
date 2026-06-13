import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const calendarColorsTable = pgTable("calendar_colors", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  dayLabel: text("day_label").notNull(),
  hexColor: text("hex_color").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCalendarColorSchema = createInsertSchema(calendarColorsTable).omit({ id: true, updatedAt: true });
export type InsertCalendarColor = z.infer<typeof insertCalendarColorSchema>;
export type CalendarColor = typeof calendarColorsTable.$inferSelect;
