import { describe, it, expect } from "vitest";
import {
  normalizeTimeZone,
  dayKey,
  shiftDay,
  longestRun,
  currentRun,
  computeProgress,
  type MealRecord,
  type ProfileRecord,
} from "./date-utils.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_PROFILE: ProfileRecord = {
  calorieTarget: 2000,
  proteinTarget: 150,
};

function meal(loggedAt: Date, overrides: Partial<MealRecord> = {}): MealRecord {
  return {
    loggedAt,
    calories: 500,
    protein: 30,
    carbs: 50,
    fat: 20,
    mealType: "lunch",
    name: "Test meal",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// normalizeTimeZone
// ---------------------------------------------------------------------------

describe("normalizeTimeZone", () => {
  it("returns UTC for undefined", () => {
    expect(normalizeTimeZone(undefined)).toBe("UTC");
  });

  it("returns UTC for an empty string", () => {
    expect(normalizeTimeZone("")).toBe("UTC");
  });

  it("returns UTC for an invalid timezone string", () => {
    expect(normalizeTimeZone("Fake/Zone")).toBe("UTC");
  });

  it("returns the timezone as-is for a valid IANA name", () => {
    expect(normalizeTimeZone("America/New_York")).toBe("America/New_York");
    expect(normalizeTimeZone("Australia/Sydney")).toBe("Australia/Sydney");
    expect(normalizeTimeZone("Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(normalizeTimeZone("Pacific/Apia")).toBe("Pacific/Apia");
  });
});

// ---------------------------------------------------------------------------
// dayKey — timezone boundary tests
// ---------------------------------------------------------------------------

describe("dayKey", () => {
  it("returns YYYY-MM-DD in UTC by default", () => {
    const d = new Date("2024-06-14T12:00:00.000Z");
    expect(dayKey(d)).toBe("2024-06-14");
  });

  it("returns the same day for UTC noon", () => {
    const d = new Date("2024-06-14T12:00:00.000Z");
    expect(dayKey(d, "UTC")).toBe("2024-06-14");
  });

  // 23:30 UTC is next calendar day in UTC+1 (and beyond)
  it("advances to next day in UTC+1 timezone at 23:30 UTC", () => {
    const d = new Date("2024-06-14T23:30:00.000Z");
    expect(dayKey(d, "UTC")).toBe("2024-06-14");
    expect(dayKey(d, "Europe/Paris")).toBe("2024-06-15"); // UTC+2 in summer
  });

  // 23:30 UTC is next day in UTC+11 (Australia/Sydney, AEST during Southern Hemisphere summer)
  it("advances by one day in Australia/Sydney at 23:30 UTC", () => {
    const d = new Date("2024-01-14T23:30:00.000Z");
    // 2024-01-14T23:30Z = 2024-01-15T10:30+11:00
    expect(dayKey(d, "Australia/Sydney")).toBe("2024-01-15");
    expect(dayKey(d, "UTC")).toBe("2024-01-14");
  });

  // 00:30 UTC is still the previous day in UTC-5 (New York, EST)
  it("is the previous day in America/New_York at 00:30 UTC", () => {
    const d = new Date("2024-06-15T00:30:00.000Z");
    // 2024-06-15T00:30Z = 2024-06-14T20:30-04:00 (EDT)
    expect(dayKey(d, "America/New_York")).toBe("2024-06-14");
    expect(dayKey(d, "UTC")).toBe("2024-06-15");
  });

  // UTC-8 (Los Angeles, PST)
  it("is two days behind UTC in America/Los_Angeles at 01:00 UTC", () => {
    const d = new Date("2024-01-15T01:00:00.000Z");
    // 2024-01-15T01:00Z = 2024-01-14T17:00-08:00 (PST)
    expect(dayKey(d, "America/Los_Angeles")).toBe("2024-01-14");
    expect(dayKey(d, "UTC")).toBe("2024-01-15");
  });

  // Exact midnight UTC — still the same UTC day
  it("handles exact midnight UTC correctly", () => {
    const d = new Date("2024-06-15T00:00:00.000Z");
    expect(dayKey(d, "UTC")).toBe("2024-06-15");
  });

  // UTC+5:30 (IST, India Standard Time)
  it("handles UTC+5:30 (Asia/Kolkata) near midnight boundary", () => {
    // 23:00 UTC = 04:30+05:30 the next day in India
    const d = new Date("2024-06-14T23:00:00.000Z");
    expect(dayKey(d, "Asia/Kolkata")).toBe("2024-06-15");
    expect(dayKey(d, "UTC")).toBe("2024-06-14");
  });

  // UTC+13 (Pacific/Apia) — farthest ahead
  it("handles UTC+13 (Pacific/Apia) for meals logged at 23:00 UTC", () => {
    // 23:00 UTC = 12:00+13:00 the next day
    const d = new Date("2024-06-14T23:00:00.000Z");
    expect(dayKey(d, "Pacific/Apia")).toBe("2024-06-15");
  });

  it("produces dates matching the YYYY-MM-DD API contract pattern", () => {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const d = new Date("2024-12-31T23:59:59.999Z");
    expect(dayKey(d, "UTC")).toMatch(datePattern);
    expect(dayKey(d, "America/New_York")).toMatch(datePattern);
    expect(dayKey(d, "Australia/Sydney")).toMatch(datePattern);
  });
});

// ---------------------------------------------------------------------------
// shiftDay
// ---------------------------------------------------------------------------

describe("shiftDay", () => {
  it("shifts forward by one day", () => {
    expect(shiftDay("2024-06-14", 1)).toBe("2024-06-15");
  });

  it("shifts backward by one day", () => {
    expect(shiftDay("2024-06-14", -1)).toBe("2024-06-13");
  });

  it("handles month boundaries forward", () => {
    expect(shiftDay("2024-01-31", 1)).toBe("2024-02-01");
  });

  it("handles month boundaries backward", () => {
    expect(shiftDay("2024-03-01", -1)).toBe("2024-02-29"); // 2024 is a leap year
  });

  it("handles year boundaries forward", () => {
    expect(shiftDay("2024-12-31", 1)).toBe("2025-01-01");
  });

  it("handles year boundaries backward", () => {
    expect(shiftDay("2025-01-01", -1)).toBe("2024-12-31");
  });

  it("shifts by zero returns same day", () => {
    expect(shiftDay("2024-06-14", 0)).toBe("2024-06-14");
  });

  it("shifts by multiple days", () => {
    expect(shiftDay("2024-06-01", 30)).toBe("2024-07-01");
  });
});

// ---------------------------------------------------------------------------
// longestRun (streak)
// ---------------------------------------------------------------------------

describe("longestRun", () => {
  it("returns 0 for an empty list", () => {
    expect(longestRun([])).toBe(0);
  });

  it("returns 1 for a single date", () => {
    expect(longestRun(["2024-06-14"])).toBe(1);
  });

  it("returns 3 for three consecutive dates", () => {
    expect(longestRun(["2024-06-12", "2024-06-13", "2024-06-14"])).toBe(3);
  });

  it("returns longest run when there are gaps", () => {
    const dates = [
      "2024-06-01",
      "2024-06-02",
      // gap
      "2024-06-05",
      "2024-06-06",
      "2024-06-07",
      "2024-06-08",
    ];
    expect(longestRun(dates)).toBe(4);
  });

  it("is not affected by duplicate dates", () => {
    const dates = ["2024-06-12", "2024-06-12", "2024-06-13", "2024-06-14"];
    expect(longestRun(dates)).toBe(3);
  });

  it("handles unsorted input", () => {
    const dates = ["2024-06-14", "2024-06-12", "2024-06-13"];
    expect(longestRun(dates)).toBe(3);
  });

  it("counts a 7-day perfect streak", () => {
    const dates = Array.from({ length: 7 }, (_, i) => shiftDay("2024-06-01", i));
    expect(longestRun(dates)).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// currentRun (active streak)
// ---------------------------------------------------------------------------

describe("currentRun", () => {
  const TODAY = "2024-06-14";

  it("returns 0 when there are no meals at all", () => {
    expect(currentRun(new Set<string>(), TODAY)).toBe(0);
  });

  it("returns 1 when only today has a meal", () => {
    expect(currentRun(new Set([TODAY]), TODAY)).toBe(1);
  });

  it("returns 1 when only yesterday has a meal (not yet logged today)", () => {
    const yesterday = shiftDay(TODAY, -1);
    expect(currentRun(new Set([yesterday]), TODAY)).toBe(1);
  });

  it("returns 0 when the last meal was two or more days ago (broken streak)", () => {
    const twoDaysAgo = shiftDay(TODAY, -2);
    expect(currentRun(new Set([twoDaysAgo]), TODAY)).toBe(0);
  });

  it("accumulates consecutive days ending today", () => {
    const dates = new Set([
      shiftDay(TODAY, -2),
      shiftDay(TODAY, -1),
      TODAY,
    ]);
    expect(currentRun(dates, TODAY)).toBe(3);
  });

  it("accumulates consecutive days ending yesterday (not yet logged today)", () => {
    const yesterday = shiftDay(TODAY, -1);
    const dates = new Set([shiftDay(TODAY, -3), shiftDay(TODAY, -2), yesterday]);
    expect(currentRun(dates, TODAY)).toBe(3);
  });

  it("stops at a gap — does not span non-consecutive days", () => {
    // logged today and 3 days ago but missed 2 days ago / yesterday
    const dates = new Set([shiftDay(TODAY, -3), TODAY]);
    expect(currentRun(dates, TODAY)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// computeProgress — meal grouping across timezones
// ---------------------------------------------------------------------------

describe("computeProgress — timezone grouping near midnight", () => {
  // A meal logged at 23:30 UTC on Jun 14 is Jun 14 in UTC but Jun 15 in UTC+1
  it("groups a meal at 23:30 UTC under the next calendar day in UTC+2 timezone", () => {
    const loggedAt = new Date("2024-06-14T23:30:00.000Z");
    const meals = [meal(loggedAt)];
    // Pass a fixed "now" that is the morning of Jun 15 so the meal is "today" in Paris
    const now = new Date("2024-06-15T06:00:00.000Z"); // 08:00 in Paris
    const result = computeProgress(meals, BASE_PROFILE, "Europe/Paris", now);
    expect(result.history).toHaveLength(1);
    expect(result.history[0].date).toBe("2024-06-15");
  });

  it("groups the same meal under the current calendar day in UTC", () => {
    const loggedAt = new Date("2024-06-14T23:30:00.000Z");
    const meals = [meal(loggedAt)];
    const now = new Date("2024-06-14T23:59:00.000Z");
    const result = computeProgress(meals, BASE_PROFILE, "UTC", now);
    expect(result.history[0].date).toBe("2024-06-14");
  });

  // 00:30 UTC on Jun 15 is still Jun 14 in New York (EDT = UTC-4)
  it("groups a meal at 00:30 UTC under the previous day in America/New_York", () => {
    const loggedAt = new Date("2024-06-15T00:30:00.000Z");
    const meals = [meal(loggedAt)];
    const now = new Date("2024-06-15T12:00:00.000Z");
    const result = computeProgress(meals, BASE_PROFILE, "America/New_York", now);
    expect(result.history[0].date).toBe("2024-06-14");
  });

  it("keeps history dates in YYYY-MM-DD format (API contract)", () => {
    const pattern = /^\d{4}-\d{2}-\d{2}$/;
    const meals = [
      meal(new Date("2024-06-14T23:30:00.000Z")),
      meal(new Date("2024-06-13T10:00:00.000Z")),
    ];
    const now = new Date("2024-06-15T06:00:00.000Z");
    const result = computeProgress(meals, BASE_PROFILE, "Australia/Sydney", now);
    for (const day of result.history) {
      expect(day.date).toMatch(pattern);
    }
  });

  it("splits a UTC-midnight-straddling day into two local days correctly", () => {
    // In UTC: both meals are on Jun 14. In UTC+13 they should be on Jun 15.
    const meals = [
      meal(new Date("2024-06-14T22:00:00.000Z")), // Jun 15 in UTC+13
      meal(new Date("2024-06-14T10:00:00.000Z")), // Jun 14 in UTC+13
    ];
    const now = new Date("2024-06-15T06:00:00.000Z");
    const resultUTC = computeProgress(meals, BASE_PROFILE, "UTC", now);
    const resultApia = computeProgress(meals, BASE_PROFILE, "Pacific/Apia", now);

    // UTC: both meals on the same day
    expect(resultUTC.history).toHaveLength(1);
    expect(resultUTC.history[0].date).toBe("2024-06-14");

    // Apia: meals split across two local days
    expect(resultApia.history).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// computeProgress — streak logic
// ---------------------------------------------------------------------------

describe("computeProgress — streak behavior", () => {
  it("starts with a streak of 0 when there are no meals", () => {
    const now = new Date("2024-06-14T12:00:00.000Z");
    const result = computeProgress([], BASE_PROFILE, "UTC", now);
    expect(result.streak.current).toBe(0);
    expect(result.streak.longest).toBe(0);
    expect(result.streak.isBroken).toBe(false);
  });

  it("streak is 1 after logging a single meal today", () => {
    const now = new Date("2024-06-14T12:00:00.000Z");
    const meals = [meal(new Date("2024-06-14T08:00:00.000Z"))];
    const result = computeProgress(meals, BASE_PROFILE, "UTC", now);
    expect(result.streak.current).toBe(1);
    expect(result.streak.isBroken).toBe(false);
  });

  it("streak is maintained when the user logged yesterday but not yet today", () => {
    const now = new Date("2024-06-14T08:00:00.000Z"); // early morning today
    const meals = [meal(new Date("2024-06-13T20:00:00.000Z"))]; // yesterday
    const result = computeProgress(meals, BASE_PROFILE, "UTC", now);
    expect(result.streak.current).toBe(1);
    expect(result.streak.isBroken).toBe(false);
  });

  it("marks streak broken when nothing logged today or yesterday", () => {
    const now = new Date("2024-06-14T12:00:00.000Z");
    const meals = [meal(new Date("2024-06-12T12:00:00.000Z"))]; // 2 days ago
    const result = computeProgress(meals, BASE_PROFILE, "UTC", now);
    expect(result.streak.isBroken).toBe(true);
    expect(result.streak.current).toBe(0);
  });

  it("does not mark streak broken when no meals have ever been logged", () => {
    const now = new Date("2024-06-14T12:00:00.000Z");
    const result = computeProgress([], BASE_PROFILE, "UTC", now);
    expect(result.streak.isBroken).toBe(false);
  });

  it("builds a 3-day streak correctly", () => {
    const now = new Date("2024-06-14T20:00:00.000Z");
    const meals = [
      meal(new Date("2024-06-14T08:00:00.000Z")),
      meal(new Date("2024-06-13T08:00:00.000Z")),
      meal(new Date("2024-06-12T08:00:00.000Z")),
    ];
    const result = computeProgress(meals, BASE_PROFILE, "UTC", now);
    expect(result.streak.current).toBe(3);
    expect(result.streak.longest).toBe(3);
  });

  it("streak accounts for timezone — a meal at 23:30 UTC can count for the next local day", () => {
    // A user in UTC+13 logs at 23:30 UTC which is already the next local day
    const loggedAt = new Date("2024-06-14T23:30:00.000Z"); // Jun 15 in Apia
    const now = new Date("2024-06-15T06:00:00.000Z"); // Jun 15 in Apia
    const meals = [meal(loggedAt)];
    const result = computeProgress(meals, BASE_PROFILE, "Pacific/Apia", now);
    // The meal is on Jun 15 local time, which is "today"
    expect(result.streak.current).toBe(1);
    expect(result.streak.isBroken).toBe(false);
  });

  it("streak sees 23:30 UTC meal as yesterday for users in America/New_York", () => {
    // 23:30 UTC Jun 14 = 19:30 EDT Jun 14 → still yesterday for NY user
    const loggedAt = new Date("2024-06-14T23:30:00.000Z");
    const now = new Date("2024-06-15T12:00:00.000Z"); // noon Jun 15 UTC = morning Jun 15 NY
    const meals = [meal(loggedAt)];
    const result = computeProgress(meals, BASE_PROFILE, "America/New_York", now);
    // Meal is on Jun 14 NY time; today is Jun 15 → streak maintained (logged yesterday)
    expect(result.streak.current).toBe(1);
    expect(result.streak.isBroken).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeProgress — achievements
// ---------------------------------------------------------------------------

describe("computeProgress — achievements", () => {
  it("first-meal achievement is locked with no meals", () => {
    const now = new Date("2024-06-14T12:00:00.000Z");
    const result = computeProgress([], BASE_PROFILE, "UTC", now);
    const firstMeal = result.achievements.find((a) => a.id === "first-meal")!;
    expect(firstMeal.unlocked).toBe(false);
    expect(firstMeal.progress).toBe(0);
  });

  it("first-meal achievement unlocks after logging one meal", () => {
    const now = new Date("2024-06-14T12:00:00.000Z");
    const meals = [meal(new Date("2024-06-14T08:00:00.000Z"))];
    const result = computeProgress(meals, BASE_PROFILE, "UTC", now);
    const firstMeal = result.achievements.find((a) => a.id === "first-meal")!;
    expect(firstMeal.unlocked).toBe(true);
    expect(firstMeal.progress).toBe(1);
  });

  it("streak-3 achievement unlocks after a 3-day streak", () => {
    const now = new Date("2024-06-14T20:00:00.000Z");
    const meals = [
      meal(new Date("2024-06-14T08:00:00.000Z")),
      meal(new Date("2024-06-13T08:00:00.000Z")),
      meal(new Date("2024-06-12T08:00:00.000Z")),
    ];
    const result = computeProgress(meals, BASE_PROFILE, "UTC", now);
    const streak3 = result.achievements.find((a) => a.id === "streak-3")!;
    expect(streak3.unlocked).toBe(true);
    expect(streak3.progress).toBe(3);
  });

  it("streak-7 achievement remains locked with only a 3-day streak", () => {
    const now = new Date("2024-06-14T20:00:00.000Z");
    const meals = [
      meal(new Date("2024-06-14T08:00:00.000Z")),
      meal(new Date("2024-06-13T08:00:00.000Z")),
      meal(new Date("2024-06-12T08:00:00.000Z")),
    ];
    const result = computeProgress(meals, BASE_PROFILE, "UTC", now);
    const streak7 = result.achievements.find((a) => a.id === "streak-7")!;
    expect(streak7.unlocked).toBe(false);
    expect(streak7.progress).toBe(3);
  });

  it("meals-10 achievement progress is capped at 10", () => {
    const now = new Date("2024-06-14T20:00:00.000Z");
    // 15 meals — all on the same day to keep things simple
    const meals = Array.from({ length: 15 }, (_, i) =>
      meal(new Date("2024-06-14T08:00:00.000Z"), { name: `Meal ${i}` }),
    );
    const result = computeProgress(meals, BASE_PROFILE, "UTC", now);
    const meals10 = result.achievements.find((a) => a.id === "meals-10")!;
    expect(meals10.progress).toBe(10);
    expect(meals10.unlocked).toBe(true);
  });

  it("perfect-week unlocks with 7 consecutive on-target days", () => {
    const now = new Date("2024-06-14T20:00:00.000Z");
    // Each on-target day needs 1800-2200 calories; use shiftDay to avoid manual date formatting
    const meals = Array.from({ length: 7 }, (_, i) => {
      const date = shiftDay("2024-06-08", i); // 2024-06-08 … 2024-06-14
      return meal(new Date(`${date}T12:00:00.000Z`), { calories: 2000 });
    });
    const result = computeProgress(meals, BASE_PROFILE, "UTC", now);
    const perfectWeek = result.achievements.find((a) => a.id === "perfect-week")!;
    expect(perfectWeek.unlocked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeProgress — daily challenge
// ---------------------------------------------------------------------------

describe("computeProgress — daily challenge", () => {
  // dayNumber = Number("20240615".replace(/-/g,'')) = 20240615
  // 20240615 % 3 = 20240615 mod 3
  // 20240615 / 3 = 6746871.67 → 6746871 * 3 = 20240613 → remainder = 2 → try-something-new
  // 20240614 mod 3: 20240614 / 3 = 6746871.3 → remainder = 1 → protein-target
  // 20240613 mod 3: 20240613 / 3 = 6746871 → remainder = 0 → main-meals

  it("selects three-meal-rhythm challenge when dayNumber % 3 === 0", () => {
    // Use 2024-06-13: 20240613 % 3 == 0
    const now = new Date("2024-06-13T12:00:00.000Z");
    const result = computeProgress([], BASE_PROFILE, "UTC", now);
    expect(result.dailyChallenge.id).toBe("main-meals");
    expect(result.dailyChallenge.target).toBe(3);
  });

  it("selects protein-focus challenge when dayNumber % 3 === 1", () => {
    // Use 2024-06-14: 20240614 % 3 == 1
    const now = new Date("2024-06-14T12:00:00.000Z");
    const result = computeProgress([], BASE_PROFILE, "UTC", now);
    expect(result.dailyChallenge.id).toBe("protein-target");
    expect(result.dailyChallenge.target).toBe(BASE_PROFILE.proteinTarget);
  });

  it("selects try-something-new challenge when dayNumber % 3 === 2", () => {
    // Use 2024-06-15: 20240615 % 3 == 2
    const now = new Date("2024-06-15T12:00:00.000Z");
    const result = computeProgress([], BASE_PROFILE, "UTC", now);
    expect(result.dailyChallenge.id).toBe("try-something-new");
    expect(result.dailyChallenge.target).toBe(1);
  });

  it("three-meal-rhythm: marks completed when breakfast, lunch, and dinner are logged today", () => {
    // day % 3 === 0
    const now = new Date("2024-06-13T20:00:00.000Z");
    const meals = [
      meal(new Date("2024-06-13T08:00:00.000Z"), { mealType: "breakfast" }),
      meal(new Date("2024-06-13T12:00:00.000Z"), { mealType: "lunch" }),
      meal(new Date("2024-06-13T18:00:00.000Z"), { mealType: "dinner" }),
    ];
    const result = computeProgress(meals, BASE_PROFILE, "UTC", now);
    expect(result.dailyChallenge.id).toBe("main-meals");
    expect(result.dailyChallenge.completed).toBe(true);
    expect(result.dailyChallenge.progress).toBe(3);
  });

  it("three-meal-rhythm: not completed with only two meal types today", () => {
    const now = new Date("2024-06-13T20:00:00.000Z");
    const meals = [
      meal(new Date("2024-06-13T08:00:00.000Z"), { mealType: "breakfast" }),
      meal(new Date("2024-06-13T12:00:00.000Z"), { mealType: "lunch" }),
    ];
    const result = computeProgress(meals, BASE_PROFILE, "UTC", now);
    expect(result.dailyChallenge.id).toBe("main-meals");
    expect(result.dailyChallenge.completed).toBe(false);
    expect(result.dailyChallenge.progress).toBe(2);
  });

  it("protein-focus: marks completed when today's protein meets the target", () => {
    // day % 3 === 1
    const now = new Date("2024-06-14T20:00:00.000Z");
    const meals = [
      meal(new Date("2024-06-14T08:00:00.000Z"), { protein: 80 }),
      meal(new Date("2024-06-14T12:00:00.000Z"), { protein: 80 }),
    ];
    const result = computeProgress(meals, { ...BASE_PROFILE, proteinTarget: 150 }, "UTC", now);
    expect(result.dailyChallenge.id).toBe("protein-target");
    expect(result.dailyChallenge.progress).toBe(160);
    expect(result.dailyChallenge.completed).toBe(true);
  });

  it("try-something-new: marks completed when a novel meal is logged today", () => {
    // day % 3 === 2
    const now = new Date("2024-06-15T20:00:00.000Z");
    const previousMeal = meal(new Date("2024-06-14T12:00:00.000Z"), { name: "Oatmeal" });
    const todayNew = meal(new Date("2024-06-15T08:00:00.000Z"), { name: "Avocado Toast" });
    const result = computeProgress(
      [todayNew, previousMeal],
      BASE_PROFILE,
      "UTC",
      now,
    );
    expect(result.dailyChallenge.id).toBe("try-something-new");
    expect(result.dailyChallenge.completed).toBe(true);
  });

  it("try-something-new: not completed when today's meal was already eaten before", () => {
    const now = new Date("2024-06-15T20:00:00.000Z");
    const previousMeal = meal(new Date("2024-06-14T12:00:00.000Z"), { name: "Oatmeal" });
    const todayRepeat = meal(new Date("2024-06-15T08:00:00.000Z"), { name: "Oatmeal" });
    const result = computeProgress(
      [todayRepeat, previousMeal],
      BASE_PROFILE,
      "UTC",
      now,
    );
    expect(result.dailyChallenge.id).toBe("try-something-new");
    expect(result.dailyChallenge.completed).toBe(false);
  });

  it("daily challenge respects the device timezone when picking today's meals", () => {
    // A meal logged at 23:30 UTC Jun 13 is Jun 14 in Australia/Sydney (UTC+11 winter)
    // Jun 14 in Sydney: dayNumber = 20240614, 20240614 % 3 === 1 → protein-focus
    const loggedAt = new Date("2024-06-13T23:30:00.000Z");
    const now = new Date("2024-06-14T06:00:00.000Z"); // mid-morning Jun 14 AEST
    const meals = [meal(loggedAt, { protein: 200 })];
    const result = computeProgress(
      meals,
      { ...BASE_PROFILE, proteinTarget: 150 },
      "Australia/Sydney",
      now,
    );
    // In Sydney the meal is on Jun 14, which is "today"
    expect(result.dailyChallenge.id).toBe("protein-target");
    expect(result.dailyChallenge.progress).toBe(200);
    expect(result.dailyChallenge.completed).toBe(true);
  });
});
