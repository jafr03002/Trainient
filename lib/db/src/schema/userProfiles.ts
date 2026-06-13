import { pgTable, text, integer, boolean, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userProfilesTable = pgTable("user_profiles", {
  userId: text("user_id").primaryKey(),
  name: text("name"),
  goal: text("goal").notNull(),
  experience: text("experience").notNull(),
  trainingDays: integer("training_days").notNull(),
  equipment: text("equipment").array().notNull().default([]),
  age: integer("age"),
  sex: text("sex"),
  weight: real("weight"),
  weightUnit: text("weight_unit").default("kg"),
  injuries: text("injuries"),
  priorityMuscles: text("priority_muscles").array().notNull().default([]),
  onboardingComplete: boolean("onboarding_complete").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserProfileSchema = createInsertSchema(userProfilesTable).omit({ createdAt: true });
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type UserProfile = typeof userProfilesTable.$inferSelect;
