import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import {
  AnalyzeMealBody,
  AnalyzeMealResponse,
  CreateMealBody,
  CreateMealResponse,
  DeleteMealParams,
  GetProgressQueryParams,
  GetProgressResponse,
  GetAccountResponse,
  GetGroceryListQueryParams,
  GetGroceryListResponse,
  GetMealPlanQueryParams,
  GetMealPlanResponse,
  GetProfileResponse,
  DeleteMealPlanSlotParams,
  DeleteMealPlanSlotResponse,
  GetRecipeRecommendationsQueryParams,
  GetRecipeRecommendationsResponse,
  LoginAccountBody,
  LoginAccountResponse,
  ListMealsQueryParams,
  ListMealsResponse,
  ListRecipesQueryParams,
  ListRecipesResponse,
  RegisterAccountBody,
  RegisterAccountResponse,
  SaveAccountProfilePreferenceBody,
  SaveAccountProfilePreferenceResponse,
  SaveGroceryItemCheckBody,
  SaveGroceryItemCheckResponse,
  SaveMealPlanSlotBody,
  SaveMealPlanSlotParams,
  SaveMealPlanSlotResponse,
  SaveProfileBody,
  SaveProfileResponse,
  ListWorkoutsResponse,
  CompleteWorkoutBody,
  CompleteWorkoutParams,
  CompleteWorkoutResponse,
  CreateBillingCheckoutBody,
  CreateBillingCheckoutResponse,
  CreateBillingPortalResponse,
  GetBillingEntitlementResponse,
  SimulateTrialExpiredResponse,
  GetWorkoutSummaryQueryParams,
  GetWorkoutSummaryResponse,
} from "@workspace/api-zod";
import {
  accountSessionsTable,
  accountsTable,
  db,
  mealsTable,
  nutritionProfilesTable,
  profileTransferConflictsTable,
  recipeGroceryChecksTable,
  recipeMealPlanSlotsTable,
  workoutCompletionsTable,
} from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { findRecipes, starterRecipes, type GroceryGroup } from "../data/macrosnap-recipes";
import { enrichRecipesWithImages } from "../lib/recipe-images";
import { starterWorkouts, workoutById } from "../data/macrosnap-workouts";
import {
  computeProgress,
  dayKey,
  normalizeTimeZone,
  shiftDay,
} from "../lib/date-utils";
import {
  BILLING_UNAVAILABLE_MESSAGE,
  createCheckoutSession,
  createPortalSession,
  getBillingEntitlement,
  isBillingAvailable,
  moveBillingProfileToAccount,
  simulateTrialExpired,
  startTrialIfNeeded,
} from "../lib/billing";

const router: IRouter = Router();
const SESSION_COOKIE = "macrosnap_session";
const ACCOUNT_SESSION_COOKIE = "macrosnap_account";
const ACCOUNT_SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 180;
const scrypt = promisify(scryptCallback);

function requireBillingAvailability(
  req: { log: { warn: (obj: unknown, message: string) => void } },
  res: { status: (status: number) => { json: (body: unknown) => void } },
  next: () => void,
) {
  if (isBillingAvailable()) {
    next();
    return;
  }

  req.log.warn({}, "Billing route unavailable while Stripe is initializing or recovering");
  res.status(503).json({
    error: BILLING_UNAVAILABLE_MESSAGE,
    code: "BILLING_UNAVAILABLE",
    retryable: true,
  });
}

function ensureSession(
  req: { cookies?: Record<string, string | undefined> },
  res: { cookie: (name: string, value: string, options: Record<string, unknown>) => void },
): string {
  const existing = req.cookies?.[SESSION_COOKIE];
  if (existing) return existing;

  const sessionId = randomUUID();
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === "production",
  });
  return sessionId;
}

function accountCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    maxAge: ACCOUNT_SESSION_DURATION_MS,
    secure: process.env.NODE_ENV === "production",
  };
}

function isTrustedAccountMutation(req: {
  get: (header: string) => string | undefined;
  is: (type: string) => string | false | null;
}) {
  if (!req.is("application/json")) return false;

  const origin = req.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.get("host");
  } catch {
    return false;
  }
}

function rejectUntrustedAccountMutation(
  req: { get: (header: string) => string | undefined; is: (type: string) => string | false | null },
  res: { status: (status: number) => { json: (body: unknown) => void } },
  requireJson = true,
) {
  if (requireJson && isTrustedAccountMutation(req)) return false;

  const hasTrustedOrigin = (() => {
    const origin = req.get("origin");
    if (!origin) return true;
    try {
      return new URL(origin).host === req.get("host");
    } catch {
      return false;
    }
  })();
  if (!requireJson && hasTrustedOrigin) return false;
  res.status(403).json({ error: "Account changes must come from the MacroCount app." });
  return true;
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

async function passwordMatches(password: string, storedHash: string) {
  const [salt, storedKey] = storedHash.split(":");
  if (!salt || !storedKey) return false;

  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  const storedBuffer = Buffer.from(storedKey, "hex");
  return (
    storedBuffer.length === derivedKey.length &&
    timingSafeEqual(storedBuffer, derivedKey)
  );
}

async function getSignedInAccountId(req: {
  cookies?: Record<string, string | undefined>;
}) {
  const sessionToken = req.cookies?.[ACCOUNT_SESSION_COOKIE];
  if (!sessionToken) return null;

  const [session] = await db
    .select()
    .from(accountSessionsTable)
    .where(eq(accountSessionsTable.id, sessionToken));
  if (!session) return null;

  if (session.expiresAt <= new Date()) {
    await db.delete(accountSessionsTable).where(eq(accountSessionsTable.id, session.id));
    return null;
  }

  return session.accountId;
}

async function getCurrentOwner(
  req: { cookies?: Record<string, string | undefined> },
  res: { cookie: (name: string, value: string, options: Record<string, unknown>) => void },
) {
  return (await getSignedInAccountId(req)) ?? ensureSession(req, res);
}

async function linkAnonymousProgress(anonymousSessionId: string, accountId: string) {
  if (anonymousSessionId === accountId) return;

  await db.transaction(async (tx) => {
    const [anonymousProfile] = await tx
      .select()
      .from(nutritionProfilesTable)
      .where(eq(nutritionProfilesTable.sessionId, anonymousSessionId));

    if (anonymousProfile) {
      const [accountProfile] = await tx
        .select({ id: nutritionProfilesTable.id })
        .from(nutritionProfilesTable)
        .where(eq(nutritionProfilesTable.sessionId, accountId));

      if (accountProfile) {
        await tx
          .insert(profileTransferConflictsTable)
          .values({ accountId, sessionId: anonymousSessionId })
          .onConflictDoNothing();
      } else {
        await tx
          .update(nutritionProfilesTable)
          .set({ sessionId: accountId, updatedAt: new Date() })
          .where(eq(nutritionProfilesTable.id, anonymousProfile.id));
      }
    }

    await tx
      .update(mealsTable)
      .set({ sessionId: accountId })
      .where(eq(mealsTable.sessionId, anonymousSessionId));
    await tx
      .update(workoutCompletionsTable)
      .set({ sessionId: accountId })
      .where(eq(workoutCompletionsTable.sessionId, anonymousSessionId));

    // Existing account entries win on a collision, so an anonymous device can
    // never block sign-in by updating into a unique session/date/slot index.
    const anonymousPlanSlots = await tx
      .select()
      .from(recipeMealPlanSlotsTable)
      .where(eq(recipeMealPlanSlotsTable.sessionId, anonymousSessionId));
    if (anonymousPlanSlots.length > 0) {
      await tx
        .insert(recipeMealPlanSlotsTable)
        .values(
          anonymousPlanSlots.map((slot) => ({
            sessionId: accountId,
            plannedFor: slot.plannedFor,
            slot: slot.slot,
            recipeId: slot.recipeId,
          })),
        )
        .onConflictDoNothing();
      await tx
        .delete(recipeMealPlanSlotsTable)
        .where(eq(recipeMealPlanSlotsTable.sessionId, anonymousSessionId));
    }

    const anonymousGroceryChecks = await tx
      .select()
      .from(recipeGroceryChecksTable)
      .where(eq(recipeGroceryChecksTable.sessionId, anonymousSessionId));
    if (anonymousGroceryChecks.length > 0) {
      await tx
        .insert(recipeGroceryChecksTable)
        .values(
          anonymousGroceryChecks.map((check) => ({
            sessionId: accountId,
            weekStart: check.weekStart,
            ingredientKey: check.ingredientKey,
            checked: check.checked,
          })),
        )
        .onConflictDoNothing();
      await tx
        .delete(recipeGroceryChecksTable)
        .where(eq(recipeGroceryChecksTable.sessionId, anonymousSessionId));
    }
  });

  await moveBillingProfileToAccount(anonymousSessionId, accountId);
}

function getMacroCountOrigin() {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (!domain) {
    throw new Error("REPLIT_DOMAINS is required to create secure billing return URLs.");
  }
  return `https://${domain}`;
}

async function getAccountStatus(
  req: { cookies?: Record<string, string | undefined> },
  signedInAccountId?: string,
) {
  const accountId = signedInAccountId ?? (await getSignedInAccountId(req));
  if (!accountId) return { email: null, pendingProfile: null };

  const [account] = await db.select().from(accountsTable).where(eq(accountsTable.id, accountId));
  if (!account) return { email: null, pendingProfile: null };

  const sessionId = req.cookies?.[SESSION_COOKIE];
  if (!sessionId) return { email: account.email, pendingProfile: null };

  const [conflict] = await db
    .select()
    .from(profileTransferConflictsTable)
    .where(
      and(
        eq(profileTransferConflictsTable.accountId, accountId),
        eq(profileTransferConflictsTable.sessionId, sessionId),
      ),
    );
  if (!conflict) return { email: account.email, pendingProfile: null };

  const [pendingProfile] = await db
    .select()
    .from(nutritionProfilesTable)
    .where(eq(nutritionProfilesTable.sessionId, sessionId));
  if (!pendingProfile) {
    await db.delete(profileTransferConflictsTable).where(eq(profileTransferConflictsTable.id, conflict.id));
    return { email: account.email, pendingProfile: null };
  }

  return { email: account.email, pendingProfile: toProfileResponse(pendingProfile) };
}

async function createAccountSession(
  accountId: string,
  res: { cookie: (name: string, value: string, options: Record<string, unknown>) => void },
) {
  const sessionToken = randomUUID();
  await db.insert(accountSessionsTable).values({
    id: sessionToken,
    accountId,
    expiresAt: new Date(Date.now() + ACCOUNT_SESSION_DURATION_MS),
  });
  res.cookie(ACCOUNT_SESSION_COOKIE, sessionToken, accountCookieOptions());
}

function toProfileResponse(profile: typeof nutritionProfilesTable.$inferSelect) {
  return {
    weight: profile.weight,
    goal: profile.goal,
    activityLevel: profile.activityLevel,
    calorieTarget: profile.calorieTarget,
    proteinTarget: profile.proteinTarget,
    carbsTarget: profile.carbsTarget,
    fatTarget: profile.fatTarget,
  };
}

function toMealResponse(meal: typeof mealsTable.$inferSelect) {
  return {
    id: meal.id,
    name: meal.name,
    mealType: meal.mealType,
    calories: meal.calories,
    protein: meal.protein,
    carbs: meal.carbs,
    fat: meal.fat,
    loggedAt: meal.loggedAt.toISOString(),
  };
}


function totalNutritionForDay(
  meals: Array<typeof mealsTable.$inferSelect>,
  date: string,
  timeZone: string,
) {
  return meals
    .filter((meal) => dayKey(meal.loggedAt, timeZone) === date)
    .reduce(
      (totals, meal) => ({
        calories: totals.calories + meal.calories,
        protein: totals.protein + meal.protein,
        carbs: totals.carbs + meal.carbs,
        fat: totals.fat + meal.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );
}

type MealPlanSlotName = "breakfast" | "lunch" | "dinner";
type RecipeImageLog = Parameters<typeof enrichRecipesWithImages>[1];

function recipeById(id: string) {
  return starterRecipes.find((recipe) => recipe.id === id);
}

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function getPlanSlots(sessionId: string, weekStart: string, log: RecipeImageLog) {
  const weekEnd = shiftDay(weekStart, 6);
  const rows = await db
    .select()
    .from(recipeMealPlanSlotsTable)
    .where(
      and(
        eq(recipeMealPlanSlotsTable.sessionId, sessionId),
        gte(recipeMealPlanSlotsTable.plannedFor, weekStart),
        lte(recipeMealPlanSlotsTable.plannedFor, weekEnd),
      ),
    )
    .orderBy(asc(recipeMealPlanSlotsTable.plannedFor), asc(recipeMealPlanSlotsTable.slot));

  const slots = rows.flatMap((row) => {
    const recipe = recipeById(row.recipeId);
    return recipe && (row.slot === "breakfast" || row.slot === "lunch" || row.slot === "dinner")
      ? [{ date: row.plannedFor, slot: row.slot as MealPlanSlotName, recipe }]
      : [];
  });
  const recipesWithImages = await enrichRecipesWithImages(
    slots.map((slot) => slot.recipe),
    log,
  );
  const recipesById = new Map(recipesWithImages.map((recipe) => [recipe.id, recipe]));

  return slots.flatMap((slot) => {
    const recipe = recipesById.get(slot.recipe.id);
    return recipe ? [{ ...slot, recipe }] : [];
  });
}

async function getGroceryListForWeek(sessionId: string, weekStart: string, log: RecipeImageLog) {
  const slots = await getPlanSlots(sessionId, weekStart, log);
  const checks = await db
    .select()
    .from(recipeGroceryChecksTable)
    .where(
      and(
        eq(recipeGroceryChecksTable.sessionId, sessionId),
        eq(recipeGroceryChecksTable.weekStart, weekStart),
      ),
    );
  const checkedByKey = new Map(checks.map((item) => [item.ingredientKey, item.checked]));
  const combined = new Map<
    string,
    { key: string; name: string; amount: number; unit: string; group: GroceryGroup }
  >();

  for (const slot of slots) {
    for (const ingredient of slot.recipe.ingredients) {
      const key = `${ingredient.group}:${ingredient.name.trim().toLowerCase()}`;
      const existing = combined.get(key);
      if (existing) {
        existing.amount += ingredient.amount;
      } else {
        combined.set(key, { key, ...ingredient });
      }
    }
  }

  const groupOrder: GroceryGroup[] = ["produce", "protein", "pantry"];
  return {
    weekStart,
    groups: groupOrder
      .map((group) => ({
        group,
        items: [...combined.values()]
          .filter((item) => item.group === group)
          .sort((left, right) => left.name.localeCompare(right.name))
          .map((item) => ({
            key: item.key,
            name: item.name,
            quantity: `${Number.isInteger(item.amount) ? item.amount : Number(item.amount.toFixed(2))} ${item.unit}`,
            checked: checkedByKey.get(item.key) ?? false,
          })),
      }))
      .filter((group) => group.items.length > 0),
  };
}

router.get("/account", async (req, res): Promise<void> => {
  res.json(GetAccountResponse.parse(await getAccountStatus(req)));
});

router.post("/account/register", async (req, res): Promise<void> => {
  if (rejectUntrustedAccountMutation(req, res)) return;
  const parsed = RegisterAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const [existingAccount] = await db
    .select({ id: accountsTable.id })
    .from(accountsTable)
    .where(eq(accountsTable.email, email));
  if (existingAccount) {
    res.status(409).json({ error: "An account already exists for this email. Sign in instead." });
    return;
  }

  const accountId = randomUUID();
  try {
    await db.insert(accountsTable).values({
      id: accountId,
      email,
      passwordHash: await hashPassword(parsed.data.password),
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "An account already exists for this email. Sign in instead." });
      return;
    }
    throw error;
  }

  const anonymousSessionId = ensureSession(req, res);
  await linkAnonymousProgress(anonymousSessionId, accountId);
  await createAccountSession(accountId, res);
  res.status(201).json(RegisterAccountResponse.parse(await getAccountStatus(req, accountId)));
});

router.post("/account/login", async (req, res): Promise<void> => {
  if (rejectUntrustedAccountMutation(req, res)) return;
  const parsed = LoginAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const [account] = await db.select().from(accountsTable).where(eq(accountsTable.email, email));
  if (!account || !(await passwordMatches(parsed.data.password, account.passwordHash))) {
    res.status(401).json({ error: "Incorrect email or password." });
    return;
  }

  const anonymousSessionId = ensureSession(req, res);
  await linkAnonymousProgress(anonymousSessionId, account.id);
  await createAccountSession(account.id, res);
  res.json(LoginAccountResponse.parse(await getAccountStatus(req, account.id)));
});

router.post("/account/logout", async (req, res): Promise<void> => {
  if (rejectUntrustedAccountMutation(req, res, false)) return;
  const sessionToken = req.cookies?.[ACCOUNT_SESSION_COOKIE];
  if (sessionToken) {
    await db.delete(accountSessionsTable).where(eq(accountSessionsTable.id, sessionToken));
  }
  res.clearCookie(ACCOUNT_SESSION_COOKIE, accountCookieOptions());
  res.sendStatus(204);
});

router.post("/account/profile-preference", async (req, res): Promise<void> => {
  if (rejectUntrustedAccountMutation(req, res)) return;
  const parsed = SaveAccountProfilePreferenceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const accountId = await getSignedInAccountId(req);
  const sessionId = req.cookies?.[SESSION_COOKIE];
  if (!accountId || !sessionId) {
    res.status(404).json({ error: "There is no profile choice to resolve." });
    return;
  }

  await db.transaction(async (tx) => {
    const [conflict] = await tx
      .select()
      .from(profileTransferConflictsTable)
      .where(
        and(
          eq(profileTransferConflictsTable.accountId, accountId),
          eq(profileTransferConflictsTable.sessionId, sessionId),
        ),
      );
    const [localProfile] = await tx
      .select()
      .from(nutritionProfilesTable)
      .where(eq(nutritionProfilesTable.sessionId, sessionId));

    if (!conflict || !localProfile) return;

    if (parsed.data.choice === "local") {
      await tx
        .update(nutritionProfilesTable)
        .set({ ...toProfileResponse(localProfile), updatedAt: new Date() })
        .where(eq(nutritionProfilesTable.sessionId, accountId));
    }

    await tx
      .delete(nutritionProfilesTable)
      .where(eq(nutritionProfilesTable.id, localProfile.id));
    await tx.delete(profileTransferConflictsTable).where(eq(profileTransferConflictsTable.id, conflict.id));
  });

  res.json(SaveAccountProfilePreferenceResponse.parse(await getAccountStatus(req)));
});

router.get("/profile", async (req, res): Promise<void> => {
  const sessionId = await getCurrentOwner(req, res);
  const [profile] = await db
    .select()
    .from(nutritionProfilesTable)
    .where(eq(nutritionProfilesTable.sessionId, sessionId));

  if (!profile) {
    res.status(404).json({ error: "Complete onboarding to create a nutrition profile." });
    return;
  }

  const entitlement = await getBillingEntitlement(sessionId);
  if (!entitlement.hasAccess) {
    res.status(402).json({ error: "Your three-day free trial has ended. Choose a plan to update your nutrition targets." });
    return;
  }

  res.json(GetProfileResponse.parse(toProfileResponse(profile)));
});

router.put("/profile", async (req, res): Promise<void> => {
  const parsed = SaveProfileBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid nutrition profile");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const sessionId = await getCurrentOwner(req, res);
  const entitlement = await getBillingEntitlement(sessionId);
  if (!entitlement.hasAccess) {
    res.status(402).json({ error: "Your three-day free trial has ended. Choose a plan to update your nutrition targets." });
    return;
  }
  const [profile] = await db
    .insert(nutritionProfilesTable)
    .values({ ...parsed.data, sessionId })
    .onConflictDoUpdate({
      target: nutritionProfilesTable.sessionId,
      set: { ...parsed.data, updatedAt: new Date() },
    })
    .returning();

  await startTrialIfNeeded(sessionId);
  res.json(SaveProfileResponse.parse(toProfileResponse(profile)));
});

router.use("/billing", requireBillingAvailability);

router.get("/billing/entitlement", async (req, res): Promise<void> => {
  const ownerId = await getCurrentOwner(req, res);
  res.json(GetBillingEntitlementResponse.parse(await getBillingEntitlement(ownerId)));
});

router.post("/billing/simulate-trial-expired", async (req, res): Promise<void> => {
  if (process.env.NODE_ENV !== "development") {
    res.status(404).json({ error: "Not found." });
    return;
  }

  try {
    const ownerId = await getCurrentOwner(req, res);
    res.json(SimulateTrialExpiredResponse.parse(await simulateTrialExpired(ownerId)));
  } catch (error) {
    req.log.error({ err: error }, "Unable to simulate trial expiry");
    res.status(400).json({ error: error instanceof Error ? error.message : "Unable to simulate trial expiry." });
  }
});

router.post("/billing/checkout", async (req, res): Promise<void> => {
  const parsed = CreateBillingCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const ownerId = await getCurrentOwner(req, res);
    const url = await createCheckoutSession(ownerId, parsed.data.plan, getMacroCountOrigin());
    res.json(CreateBillingCheckoutResponse.parse({ url }));
  } catch (error) {
    req.log.error({ err: error }, "Unable to create Stripe Checkout session");
    res.status(400).json({ error: error instanceof Error ? error.message : "Unable to start Checkout." });
  }
});

router.post("/billing/portal", async (req, res): Promise<void> => {
  try {
    const ownerId = await getCurrentOwner(req, res);
    const url = await createPortalSession(ownerId, getMacroCountOrigin());
    res.json(CreateBillingPortalResponse.parse({ url }));
  } catch (error) {
    req.log.error({ err: error }, "Unable to create Stripe portal session");
    res.status(400).json({ error: error instanceof Error ? error.message : "Unable to open billing." });
  }
});

router.use(async (req, res, next) => {
  try {
    if (!isBillingAvailable()) {
      next();
      return;
    }

    const ownerId = await getCurrentOwner(req, res);
    const entitlement = await getBillingEntitlement(ownerId);
    if (!entitlement.hasAccess) {
      res.status(402).json({
        error: "Your three-day free trial has ended. Choose a plan to keep using MacroCount.",
      });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
});

router.get("/recipes", async (req, res): Promise<void> => {
  const query = ListRecipesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const recipes = await enrichRecipesWithImages(
    findRecipes(query.data.search, query.data.mealType),
    req.log,
  );
  res.json(ListRecipesResponse.parse(recipes));
});

router.get("/recipes/recommendations", async (req, res): Promise<void> => {
  const query = GetRecipeRecommendationsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const timeZone = normalizeTimeZone(query.data.timeZone);
  const sessionId = await getCurrentOwner(req, res);
  const [profile] = await db
    .select()
    .from(nutritionProfilesTable)
    .where(eq(nutritionProfilesTable.sessionId, sessionId));

  if (!profile) {
    res.status(404).json({ error: "Complete onboarding to get recipe suggestions." });
    return;
  }

  const meals = await db
    .select()
    .from(mealsTable)
    .where(eq(mealsTable.sessionId, sessionId));
  const todayTotals = totalNutritionForDay(meals, dayKey(new Date(), timeZone), timeZone);
  const remaining = {
    calories: Math.max(0, profile.calorieTarget - todayTotals.calories),
    protein: Math.max(0, profile.proteinTarget - todayTotals.protein),
    carbs: Math.max(0, profile.carbsTarget - todayTotals.carbs),
    fat: Math.max(0, profile.fatTarget - todayTotals.fat),
  };
  const catalog = starterRecipes
    .map(
      (recipe) =>
        `${recipe.id}: ${recipe.name} — ${recipe.calories} kcal, ${recipe.protein}g protein, ${recipe.carbs}g carbs, ${recipe.fat}g fat`,
    )
    .join("\n");

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.6-terra",
      max_completion_tokens: 8192,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: `You suggest recipes for a macro tracker. Based on today's remaining targets, choose 2 or 3 recipes from the catalog only. Return a JSON object with exactly recipeIds and message. recipeIds must be an array of catalog IDs only, with no duplicates. message must be one short, supportive sentence explaining the fit. If no option is reasonable, return an empty recipeIds array and explain that clearly.

Remaining today: ${remaining.calories} kcal, ${remaining.protein}g protein, ${remaining.carbs}g carbs, ${remaining.fat}g fat.

Catalog:
${catalog}`,
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      req.log.error("AI recipe recommendations returned no content");
      res.status(502).json({ error: "Recipe recommendations are unavailable right now. Please browse the library." });
      return;
    }

    const suggested = JSON.parse(raw) as { recipeIds?: unknown; message?: unknown };
    if (!Array.isArray(suggested.recipeIds) || !suggested.recipeIds.every((id) => typeof id === "string") || typeof suggested.message !== "string") {
      req.log.error("AI recipe recommendations did not match the expected shape");
      res.status(502).json({ error: "Recipe recommendations are unavailable right now. Please browse the library." });
      return;
    }

    const selectedIds = [...new Set(suggested.recipeIds)];
    const recipes = selectedIds
      .map((id) => starterRecipes.find((recipe) => recipe.id === id))
      .filter((recipe): recipe is (typeof starterRecipes)[number] => Boolean(recipe));
    if (selectedIds.length < 2 || selectedIds.length > 3 || selectedIds.length !== recipes.length) {
      req.log.error("AI recipe recommendations did not contain 2–3 known recipes");
      res.status(502).json({ error: "Recipe recommendations are unavailable right now. Please browse the library." });
      return;
    }

    const recipesWithImages = await enrichRecipesWithImages(recipes, req.log);
    res.json(GetRecipeRecommendationsResponse.parse({ recipes: recipesWithImages, message: suggested.message }));
  } catch (error) {
    req.log.error({ err: error }, "AI recipe recommendations failed");
    res.status(502).json({ error: "Recipe recommendations are unavailable right now. Please browse the library." });
  }
});

router.get("/meal-plan", async (req, res): Promise<void> => {
  const query = GetMealPlanQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  if (!isCalendarDate(query.data.weekStart)) {
    res.status(400).json({ error: "weekStart must be a real calendar date." });
    return;
  }

  const sessionId = await getCurrentOwner(req, res);
  const slots = await getPlanSlots(sessionId, query.data.weekStart, req.log);
  res.json(GetMealPlanResponse.parse({ weekStart: query.data.weekStart, slots }));
});

router.get("/meal-plan/grocery", async (req, res): Promise<void> => {
  const query = GetGroceryListQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  if (!isCalendarDate(query.data.weekStart)) {
    res.status(400).json({ error: "weekStart must be a real calendar date." });
    return;
  }

  const sessionId = await getCurrentOwner(req, res);
  res.json(GetGroceryListResponse.parse(await getGroceryListForWeek(sessionId, query.data.weekStart, req.log)));
});

router.put("/meal-plan/grocery/checks", async (req, res): Promise<void> => {
  const body = SaveGroceryItemCheckBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (!isCalendarDate(body.data.weekStart)) {
    res.status(400).json({ error: "weekStart must be a real calendar date." });
    return;
  }

  const sessionId = await getCurrentOwner(req, res);
  const list = await getGroceryListForWeek(sessionId, body.data.weekStart, req.log);
  const knownItem = list.groups.flatMap((group) => group.items).find((item) => item.key === body.data.ingredientKey);
  if (!knownItem) {
    res.status(404).json({ error: "That item is not on this week's grocery list." });
    return;
  }

  await db
    .insert(recipeGroceryChecksTable)
    .values({
      sessionId,
      weekStart: body.data.weekStart,
      ingredientKey: body.data.ingredientKey,
      checked: body.data.checked,
    })
    .onConflictDoUpdate({
      target: [
        recipeGroceryChecksTable.sessionId,
        recipeGroceryChecksTable.weekStart,
        recipeGroceryChecksTable.ingredientKey,
      ],
      set: { checked: body.data.checked, updatedAt: new Date() },
    });
  res.json(SaveGroceryItemCheckResponse.parse(await getGroceryListForWeek(sessionId, body.data.weekStart, req.log)));
});

router.put("/meal-plan/:date/:slot", async (req, res): Promise<void> => {
  const params = SaveMealPlanSlotParams.safeParse(req.params);
  const body = SaveMealPlanSlotBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (!isCalendarDate(params.data.date)) {
    res.status(400).json({ error: "date must be a real calendar date." });
    return;
  }

  const recipe = recipeById(body.data.recipeId);
  if (!recipe) {
    res.status(404).json({ error: "That recipe is not in the MacroCount library." });
    return;
  }

  const sessionId = await getCurrentOwner(req, res);
  await db
    .insert(recipeMealPlanSlotsTable)
    .values({
      sessionId,
      plannedFor: params.data.date,
      slot: params.data.slot,
      recipeId: recipe.id,
    })
    .onConflictDoUpdate({
      target: [
        recipeMealPlanSlotsTable.sessionId,
        recipeMealPlanSlotsTable.plannedFor,
        recipeMealPlanSlotsTable.slot,
      ],
      set: { recipeId: recipe.id, updatedAt: new Date() },
    });

  res.json(
    SaveMealPlanSlotResponse.parse({
      date: params.data.date,
      slot: params.data.slot,
      recipe: (await enrichRecipesWithImages([recipe], req.log))[0],
    }),
  );
});

router.delete("/meal-plan/:date/:slot", async (req, res): Promise<void> => {
  const params = DeleteMealPlanSlotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!isCalendarDate(params.data.date)) {
    res.status(400).json({ error: "date must be a real calendar date." });
    return;
  }

  const sessionId = await getCurrentOwner(req, res);
  await db
    .delete(recipeMealPlanSlotsTable)
    .where(
      and(
        eq(recipeMealPlanSlotsTable.sessionId, sessionId),
        eq(recipeMealPlanSlotsTable.plannedFor, params.data.date),
        eq(recipeMealPlanSlotsTable.slot, params.data.slot),
      ),
    );
  res.status(204).send(DeleteMealPlanSlotResponse.parse(undefined));
});

router.get("/workouts", (_req, res): void => {
  res.json(
    ListWorkoutsResponse.parse(
      starterWorkouts.map(({ caloriesPerMinute: _caloriesPerMinute, ...workout }) => workout),
    ),
  );
});

router.post("/workouts/:workoutId/complete", async (req, res): Promise<void> => {
  const params = CompleteWorkoutParams.safeParse(req.params);
  const body = CompleteWorkoutBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "A valid workout and duration are required." });
    return;
  }
  const workout = workoutById(params.data.workoutId);
  if (!workout) {
    res.status(404).json({ error: "That workout is not available." });
    return;
  }

  const sessionId = await getCurrentOwner(req, res);
  const caloriesBurned = Math.max(1, Math.round(workout.caloriesPerMinute * body.data.durationSeconds / 60));
  const [completion] = await db
    .insert(workoutCompletionsTable)
    .values({
      sessionId,
      workoutId: workout.id,
      name: workout.name,
      category: workout.category,
      durationSeconds: Math.round(body.data.durationSeconds),
      caloriesBurned,
    })
    .returning();
  res.status(201).json(
    CompleteWorkoutResponse.parse({
      ...completion,
      completedAt: completion.completedAt.toISOString(),
    }),
  );
});

router.get("/workouts/summary", async (req, res): Promise<void> => {
  const query = GetWorkoutSummaryQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const timeZone = normalizeTimeZone(query.data.timeZone);
  const sessionId = await getCurrentOwner(req, res);
  const completions = await db
    .select()
    .from(workoutCompletionsTable)
    .where(eq(workoutCompletionsTable.sessionId, sessionId))
    .orderBy(desc(workoutCompletionsTable.completedAt));
  const today = dayKey(new Date(), timeZone);
  const todayCompletions = completions.filter((completion) => dayKey(completion.completedAt, timeZone) === today);
  res.json(
    GetWorkoutSummaryResponse.parse({
      today: {
        date: today,
        caloriesBurned: todayCompletions.reduce((total, completion) => total + completion.caloriesBurned, 0),
        workoutCount: todayCompletions.length,
      },
      history: completions.map((completion) => ({
        ...completion,
        completedAt: completion.completedAt.toISOString(),
      })),
    }),
  );
});

router.get("/progress", async (req, res): Promise<void> => {
  const query = GetProgressQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const timeZone = normalizeTimeZone(query.data.timeZone);
  const sessionId = await getCurrentOwner(req, res);
  const [profile] = await db
    .select()
    .from(nutritionProfilesTable)
    .where(eq(nutritionProfilesTable.sessionId, sessionId));

  if (!profile) {
    res.status(404).json({ error: "Complete onboarding to view your progress." });
    return;
  }

  const meals = await db
    .select()
    .from(mealsTable)
    .where(eq(mealsTable.sessionId, sessionId))
    .orderBy(desc(mealsTable.loggedAt));

  res.json(GetProgressResponse.parse(computeProgress(meals, profile, timeZone)));
});

router.get("/meals", async (req, res): Promise<void> => {
  const rawDate = Array.isArray(req.query.date) ? req.query.date[0] : req.query.date;
  const rawTimeZone = Array.isArray(req.query.timeZone) ? req.query.timeZone[0] : req.query.timeZone;
  const requestedDate =
    typeof rawDate === "string" ? new Date(`${rawDate}T00:00:00.000Z`) : undefined;
  const query = ListMealsQueryParams.safeParse({
    date: requestedDate,
    timeZone: typeof rawTimeZone === "string" ? rawTimeZone : undefined,
  });
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const sessionId = await getCurrentOwner(req, res);
  const meals = await db
    .select()
    .from(mealsTable)
    .where(eq(mealsTable.sessionId, sessionId))
    .orderBy(desc(mealsTable.loggedAt));

  const selectedDate = query.data.date?.toISOString().slice(0, 10);
  const timeZone = normalizeTimeZone(query.data.timeZone);
  const matchingMeals = selectedDate
    ? meals.filter((meal) => dayKey(meal.loggedAt, timeZone) === selectedDate)
    : meals;
  res.json(ListMealsResponse.parse(matchingMeals.map(toMealResponse)));
});

router.post("/meals", async (req, res): Promise<void> => {
  const parsed = CreateMealBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const sessionId = await getCurrentOwner(req, res);
  const [meal] = await db
    .insert(mealsTable)
    .values({ ...parsed.data, sessionId })
    .returning();

  res.status(201).json(CreateMealResponse.parse(toMealResponse(meal)));
});

router.delete("/meals/:id", async (req, res): Promise<void> => {
  const params = DeleteMealParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const sessionId = await getCurrentOwner(req, res);
  const [deleted] = await db
    .delete(mealsTable)
    .where(and(eq(mealsTable.id, params.data.id), eq(mealsTable.sessionId, sessionId)))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Meal not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/meals/analyze", async (req, res): Promise<void> => {
  const parsed = AnalyzeMealBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { imageData, description } = parsed.data;
  if (!imageData && !description?.trim()) {
    res.status(400).json({ error: "Add a meal photo or a short description." });
    return;
  }

  const instructions = `You are a nutrition estimator for a food logging app. Estimate the entire meal's nutrition conservatively. Return only a JSON object with exactly: name, mealType, calories, protein, carbs, fat, confidence, notes. mealType must be one of breakfast, lunch, dinner, snack. All macro and calorie values must be whole numbers. confidence is 0-100. notes should state key assumptions in one concise sentence.`;
  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: `${instructions}\nUser description: ${description?.trim() || "No written description; inspect the image."}`,
    },
  ];

  if (imageData) {
    content.push({ type: "image_url", image_url: { url: imageData } });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.6-terra",
      max_completion_tokens: 8192,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: content as never }],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      req.log.error("AI meal analysis returned no content");
      res.status(502).json({ error: "The meal estimate could not be generated. Please try again." });
      return;
    }

    const estimate = AnalyzeMealResponse.safeParse(JSON.parse(raw));
    if (!estimate.success) {
      req.log.error({ errors: estimate.error.message }, "AI meal analysis did not match schema");
      res.status(502).json({ error: "The meal estimate was incomplete. Please try another photo or description." });
      return;
    }

    res.json(estimate.data);
  } catch (error) {
    req.log.error({ err: error }, "AI meal analysis failed");
    const message = error instanceof Error ? error.message : "";
    if (
      message.includes("unsupported image") ||
      message.includes("image_parse_error") ||
      message.includes("Invalid base64 image_url") ||
      message.includes("invalid_base64")
    ) {
      res.status(400).json({
        error:
          "We couldn't read this photo. Please choose a clear JPEG or PNG image, or describe the meal instead.",
      });
      return;
    }
    res.status(502).json({ error: "Meal analysis is temporarily unavailable. Please try again shortly." });
  }
});

export default router;