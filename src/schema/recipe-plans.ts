import { boolean, date, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const recipeMealPlanSlotsTable = pgTable(
  "recipe_meal_plan_slots",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    plannedFor: date("planned_for", { mode: "string" }).notNull(),
    slot: text("slot").notNull(),
    recipeId: text("recipe_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("recipe_meal_plan_slots_session_date_slot_unique").on(
      table.sessionId,
      table.plannedFor,
      table.slot,
    ),
  ],
);

export const recipeGroceryChecksTable = pgTable(
  "recipe_grocery_checks",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    ingredientKey: text("ingredient_key").notNull(),
    checked: boolean("checked").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("recipe_grocery_checks_session_week_ingredient_unique").on(
      table.sessionId,
      table.weekStart,
      table.ingredientKey,
    ),
  ],
);

export const insertRecipeMealPlanSlotSchema = createInsertSchema(recipeMealPlanSlotsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertRecipeGroceryCheckSchema = createInsertSchema(recipeGroceryChecksTable).omit({
  id: true,
  updatedAt: true,
});

export type InsertRecipeMealPlanSlot = z.infer<typeof insertRecipeMealPlanSlotSchema>;
export type InsertRecipeGroceryCheck = z.infer<typeof insertRecipeGroceryCheckSchema>;
export type RecipeMealPlanSlot = typeof recipeMealPlanSlotsTable.$inferSelect;
export type RecipeGroceryCheck = typeof recipeGroceryChecksTable.$inferSelect;