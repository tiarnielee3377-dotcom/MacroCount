import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const recipeImageCacheTable = pgTable(
  "recipe_image_cache",
  {
    recipeId: text("recipe_id").primaryKey(),
    imageUrl: text("image_url").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
);