import { integer, pgTable, real, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const accountsTable = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("accounts_email_unique").on(table.email)],
);

export const accountSessionsTable = pgTable("account_sessions", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accountsTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const profileTransferConflictsTable = pgTable(
  "profile_transfer_conflicts",
  {
    id: serial("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accountsTable.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("profile_transfer_conflicts_account_session_unique").on(table.accountId, table.sessionId)],
);

export const nutritionProfilesTable = pgTable(
  "nutrition_profiles",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    weight: real("weight").notNull(),
    goal: text("goal").notNull(),
    activityLevel: text("activity_level").notNull(),
    calorieTarget: integer("calorie_target").notNull(),
    proteinTarget: integer("protein_target").notNull(),
    carbsTarget: integer("carbs_target").notNull(),
    fatTarget: integer("fat_target").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("nutrition_profiles_session_id_unique").on(table.sessionId)],
);

export const mealsTable = pgTable("meals", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  name: text("name").notNull(),
  mealType: text("meal_type").notNull(),
  calories: integer("calories").notNull(),
  protein: integer("protein").notNull(),
  carbs: integer("carbs").notNull(),
  fat: integer("fat").notNull(),
  loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workoutCompletionsTable = pgTable("workout_completions", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  workoutId: text("workout_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  caloriesBurned: integer("calories_burned").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNutritionProfileSchema = createInsertSchema(nutritionProfilesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertMealSchema = createInsertSchema(mealsTable).omit({ id: true, loggedAt: true });
export const insertWorkoutCompletionSchema = createInsertSchema(workoutCompletionsTable).omit({
  id: true,
  completedAt: true,
});
export const insertAccountSchema = createInsertSchema(accountsTable).omit({ createdAt: true });
export const insertAccountSessionSchema = createInsertSchema(accountSessionsTable).omit({ createdAt: true });
export const insertProfileTransferConflictSchema = createInsertSchema(profileTransferConflictsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertNutritionProfile = z.infer<typeof insertNutritionProfileSchema>;
export type InsertMeal = z.infer<typeof insertMealSchema>;
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type InsertAccountSession = z.infer<typeof insertAccountSessionSchema>;
export type InsertProfileTransferConflict = z.infer<typeof insertProfileTransferConflictSchema>;
export type NutritionProfile = typeof nutritionProfilesTable.$inferSelect;
export type Meal = typeof mealsTable.$inferSelect;
export type WorkoutCompletion = typeof workoutCompletionsTable.$inferSelect;
export type Account = typeof accountsTable.$inferSelect;
export type AccountSession = typeof accountSessionsTable.$inferSelect;
export type ProfileTransferConflict = typeof profileTransferConflictsTable.$inferSelect;