import { pgTable, text, integer, boolean, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userProfilesTable = pgTable("user_profiles", {
  userId: text("user_id").primaryKey(),
  name: text("name"),
  mode: text("mode").notNull().default("ai"),
  goal: text("goal").notNull().default(""),
  experience: text("experience").notNull().default(""),
  trainingDays: integer("training_days").notNull().default(4),
  equipment: text("equipment").array().notNull().default([]),
  age: integer("age"),
  sex: text("sex"),
  weight: real("weight"),
  weightUnit: text("weight_unit").default("kg"),
  goalWeight: real("goal_weight"),
  activityLevel: text("activity_level"),
  preferredRestDays: text("rest_days").array().notNull().default([]),
  injuries: text("injuries"),
  injurySeverity: text("injury_severity"),
  priorityMuscles: text("priority_muscles").array().notNull().default([]),
  onboardingComplete: boolean("onboarding_complete").notNull().default(false),
  onboardingCompletedAt: timestamp("onboarding_completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserProfileSchema = createInsertSchema(userProfilesTable).omit({ createdAt: true });
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type UserProfile = typeof userProfilesTable.$inferSelect;
