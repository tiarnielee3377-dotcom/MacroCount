import { inArray } from "drizzle-orm";
import { db, recipeImageCacheTable } from "@workspace/db";
import type { StarterRecipe } from "../data/macrosnap-recipes";

type RecipeWithImage = StarterRecipe & { imageUrl: string | null };

type Log = {
  warn: (details: Record<string, unknown>, message: string) => void;
};

type UnsplashSearchResponse = {
  results?: Array<{
    urls?: {
      small?: unknown;
      regular?: unknown;
    };
  }>;
};

const SEARCH_TIMEOUT_MS = 5_000;
const MAX_CONCURRENT_LOOKUPS = 3;
const LOOKUP_BUDGET_MS = 1_200;
const FAILED_LOOKUP_RETRY_MS = 5 * 60 * 1_000;
const failedLookupRetryAfter = new Map<string, number>();

function recipeSearchQueries(recipe: StarterRecipe) {
  const ingredientTerms = recipe.ingredients
    .slice(0, 3)
    .map((ingredient) => ingredient.name)
    .join(" ");
  return [...new Set([
    `${recipe.name} food`,
    `${recipe.name} ${ingredientTerms} food`,
  ])];
}

function isHttpsUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("https://");
}

async function searchUnsplash(
  recipe: StarterRecipe,
  log: Log,
  deadline: number,
): Promise<string | null> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) return null;

  for (const query of recipeSearchQueries(recipe)) {
    const remainingBudget = deadline - Date.now();
    if (remainingBudget <= 0) return null;

    try {
      const response = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`,
        {
          headers: {
            Authorization: `Client-ID ${accessKey}`,
            "Accept-Version": "v1",
          },
          signal: AbortSignal.timeout(Math.min(SEARCH_TIMEOUT_MS, remainingBudget)),
        },
      );
      if (!response.ok) {
        log.warn({ recipeId: recipe.id, status: response.status }, "Unsplash recipe image search failed");
        return null;
      }

      const payload = (await response.json()) as UnsplashSearchResponse;
      const image = payload.results
        ?.map((result) => result.urls?.small ?? result.urls?.regular)
        .find(isHttpsUrl);
      if (image) return image;
    } catch (error) {
      log.warn({ err: error, recipeId: recipe.id }, "Unsplash recipe image lookup failed");
      return null;
    }
  }

  return null;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await mapper(values[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function saveImageUrl(recipeId: string, imageUrl: string, log: Log) {
  try {
    await db
      .insert(recipeImageCacheTable)
      .values({ recipeId, imageUrl })
      .onConflictDoNothing();
  } catch (error) {
    log.warn({ err: error, recipeId }, "Could not cache recipe image URL");
  }
}

export async function enrichRecipesWithImages(
  recipes: StarterRecipe[],
  log: Log,
): Promise<RecipeWithImage[]> {
  if (!recipes.length) return [];

  const recipeIds = recipes.map((recipe) => recipe.id);
  let cachedRows: Array<{ recipeId: string; imageUrl: string }> = [];
  try {
    cachedRows = await db
      .select({
        recipeId: recipeImageCacheTable.recipeId,
        imageUrl: recipeImageCacheTable.imageUrl,
      })
      .from(recipeImageCacheTable)
      .where(inArray(recipeImageCacheTable.recipeId, recipeIds));
  } catch (error) {
    log.warn({ err: error }, "Could not load cached recipe image URLs");
  }

  const imageUrls = new Map(cachedRows.map((row) => [row.recipeId, row.imageUrl]));
  const deadline = Date.now() + LOOKUP_BUDGET_MS;
  const uncached = recipes.filter((recipe) => (
    !imageUrls.has(recipe.id) &&
    (failedLookupRetryAfter.get(recipe.id) ?? 0) <= Date.now()
  ));
  const resolved = await mapWithConcurrency(uncached, MAX_CONCURRENT_LOOKUPS, async (recipe) => {
    const imageUrl = await searchUnsplash(recipe, log, deadline);
    if (imageUrl) {
      failedLookupRetryAfter.delete(recipe.id);
      await saveImageUrl(recipe.id, imageUrl, log);
    } else if (process.env.UNSPLASH_ACCESS_KEY) {
      failedLookupRetryAfter.set(recipe.id, Date.now() + FAILED_LOOKUP_RETRY_MS);
    }
    return { recipeId: recipe.id, imageUrl };
  });
  for (const result of resolved) {
    if (result.imageUrl) imageUrls.set(result.recipeId, result.imageUrl);
  }

  return recipes.map((recipe) => ({
    ...recipe,
    imageUrl: imageUrls.get(recipe.id) ?? null,
  }));
}