/**
 * Pure date-arithmetic helpers for MacroCount.
 *
 * All functions are side-effect free and deterministic given the same inputs,
 * making them straightforward to unit-test across timezone boundaries.
 */

// ---------------------------------------------------------------------------
// Timezone helpers
// ---------------------------------------------------------------------------

export function normalizeTimeZone(timeZone?: string): string {
  if (!timeZone) return "UTC";
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format();
    return timeZone;
  } catch {
    return "UTC";
  }
}

/**
 * Returns the calendar date (YYYY-MM-DD) of `date` in the given timezone.
 */
export function dayKey(date: Date, timeZone = "UTC"): string {
  const parts = Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

/**
 * Shifts a YYYY-MM-DD string by `amount` calendar days.
 * Month and year boundaries are handled correctly.
 */
export function shiftDay(date: string, amount: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return dayKey(value);
}

// ---------------------------------------------------------------------------
// Streak helpers
// ---------------------------------------------------------------------------

/**
 * Returns the longest unbroken run of consecutive days in the list.
 * Duplicate dates are collapsed.
 */
export function longestRun(dates: string[]): number {
  let best = 0;
  let current = 0;
  let previous = "";

  for (const date of [...new Set(dates)].sort()) {
    current = previous && date === shiftDay(previous, 1) ? current + 1 : 1;
    best = Math.max(best, current);
    previous = date;
  }

  return best;
}

/**
 * Returns the length of the active streak ending on `today` (or the day
 * before today, so a user who hasn't yet logged today doesn't lose their
 * streak).
 */
export function currentRun(loggedDates: Set<string>, today: string): number {
  let cursor = loggedDates.has(today) ? today : shiftDay(today, -1);
  let count = 0;

  while (loggedDates.has(cursor)) {
    count += 1;
    cursor = shiftDay(cursor, -1);
  }

  return count;
}

// ---------------------------------------------------------------------------
// Progress computation
// ---------------------------------------------------------------------------

export interface MealRecord {
  loggedAt: Date;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  mealType: string;
  name: string;
}

export interface ProfileRecord {
  calorieTarget: number;
  proteinTarget: number;
}

interface DailyTotals {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  mealCount: number;
  onTarget: boolean;
}

export interface ProgressResult {
  history: DailyTotals[];
  streak: { current: number; longest: number; isBroken: boolean };
  achievements: Achievement[];
  dailyChallenge: DailyChallenge & { completed: boolean };
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  progress: number;
  target: number;
  unlocked: boolean;
}

export interface DailyChallenge {
  id: string;
  title: string;
  description: string;
  progress: number;
  target: number;
}

/**
 * Pure computation of the full progress response.
 *
 * @param meals  All meals for this session, ordered newest-first.
 * @param profile The user's nutrition targets.
 * @param timeZone IANA timezone string (already validated).
 * @param now    The instant treated as "now" for the streak's "today" cursor.
 *               Defaults to the real current time; pass an explicit value in
 *               tests to make results deterministic.
 */
export function computeProgress(
  meals: MealRecord[],
  profile: ProfileRecord,
  timeZone: string,
  now: Date = new Date(),
): ProgressResult {
  const totalsByDay = new Map<string, DailyTotals>();

  for (const meal of meals) {
    const date = dayKey(meal.loggedAt, timeZone);
    const existing = totalsByDay.get(date) ?? {
      date,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      mealCount: 0,
      onTarget: false,
    };
    existing.calories += meal.calories;
    existing.protein += meal.protein;
    existing.carbs += meal.carbs;
    existing.fat += meal.fat;
    existing.mealCount += 1;
    totalsByDay.set(date, existing);
  }

  const history: DailyTotals[] = [...totalsByDay.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((day) => ({
      ...day,
      onTarget:
        day.calories >= profile.calorieTarget * 0.9 &&
        day.calories <= profile.calorieTarget * 1.1,
    }));

  const today = dayKey(now, timeZone);
  const loggedDates = new Set(history.map((day) => day.date));
  const currentStreak = currentRun(loggedDates, today);
  const longestStreak = longestRun(history.map((day) => day.date));
  const longestPerfectRun = longestRun(
    history.filter((day) => day.onTarget).map((day) => day.date),
  );
  const todaySummary = history.find((day) => day.date === today);
  const todayMeals = meals.filter((meal) => dayKey(meal.loggedAt, timeZone) === today);
  const mealTypes = new Set(todayMeals.map((meal) => meal.mealType));
  const previousMealNames = new Set(
    meals
      .filter((meal) => dayKey(meal.loggedAt, timeZone) !== today)
      .map((meal) => meal.name.trim().toLowerCase()),
  );
  const triedNewFood = todayMeals.some(
    (meal) => !previousMealNames.has(meal.name.trim().toLowerCase()),
  );
  const dayNumber = Number(today.replaceAll("-", ""));

  const dailyChallenge: DailyChallenge =
    dayNumber % 3 === 0
      ? {
          id: "main-meals",
          title: "Three-meal rhythm",
          description: "Log breakfast, lunch, and dinner today.",
          progress: ["breakfast", "lunch", "dinner"].filter((t) => mealTypes.has(t)).length,
          target: 3,
        }
      : dayNumber % 3 === 1
        ? {
            id: "protein-target",
            title: "Protein focus",
            description: "Hit your protein target today.",
            progress: todaySummary?.protein ?? 0,
            target: profile.proteinTarget,
          }
        : {
            id: "try-something-new",
            title: "Try something new",
            description: "Log a meal you haven't had before.",
            progress: triedNewFood ? 1 : 0,
            target: 1,
          };

  const totalMeals = meals.length;
  const achievements: Achievement[] = [
    {
      id: "first-meal",
      name: "First bite",
      description: "Log your first meal.",
      icon: "utensils",
      progress: Math.min(totalMeals, 1),
      target: 1,
    },
    {
      id: "streak-3",
      name: "Three days strong",
      description: "Build a 3-day logging streak.",
      icon: "flame",
      progress: Math.min(longestStreak, 3),
      target: 3,
    },
    {
      id: "streak-7",
      name: "Week in motion",
      description: "Build a 7-day logging streak.",
      icon: "flame",
      progress: Math.min(longestStreak, 7),
      target: 7,
    },
    {
      id: "streak-30",
      name: "Thirty-day rhythm",
      description: "Build a 30-day logging streak.",
      icon: "flame",
      progress: Math.min(longestStreak, 30),
      target: 30,
    },
    {
      id: "meals-10",
      name: "Ten logged",
      description: "Log 10 meals.",
      icon: "target",
      progress: Math.min(totalMeals, 10),
      target: 10,
    },
    {
      id: "meals-50",
      name: "Fifty logged",
      description: "Log 50 meals.",
      icon: "target",
      progress: Math.min(totalMeals, 50),
      target: 50,
    },
    {
      id: "meals-100",
      name: "Century club",
      description: "Log 100 meals.",
      icon: "target",
      progress: Math.min(totalMeals, 100),
      target: 100,
    },
    {
      id: "perfect-week",
      name: "Perfect week",
      description: "Hit your calorie target for 7 days in a row.",
      icon: "award",
      progress: Math.min(longestPerfectRun, 7),
      target: 7,
    },
  ].map((a) => ({ ...a, unlocked: a.progress >= a.target }));

  return {
    history,
    streak: {
      current: currentStreak,
      longest: longestStreak,
      isBroken: history.length > 0 && !loggedDates.has(today) && !loggedDates.has(shiftDay(today, -1)),
    },
    achievements,
    dailyChallenge: {
      ...dailyChallenge,
      completed: dailyChallenge.progress >= dailyChallenge.target,
    },
  };
}
