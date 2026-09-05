import type {
  MacroProgress,
  Meal,
  NutritionProfile,
  WorkoutSummary,
} from "@workspace/api-client-react";

const CACHE_VERSION = 1;
const CACHE_KEY_PREFIX = "macrocount:dashboard-cache:";

export type DashboardSnapshot = {
  version: typeof CACHE_VERSION;
  savedAt: string;
  date: string;
  timeZone: string;
  profile: NutritionProfile;
  meals: Meal[];
  progress: MacroProgress | null;
  workoutSummary: WorkoutSummary | null;
};

function getCacheKey(timeZone: string) {
  return `${CACHE_KEY_PREFIX}${timeZone}`;
}

export function readDashboardSnapshot(timeZone: string): DashboardSnapshot | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(getCacheKey(timeZone));
    if (!raw) return null;

    const snapshot = JSON.parse(raw) as DashboardSnapshot;
    if (
      snapshot.version !== CACHE_VERSION ||
      snapshot.timeZone !== timeZone ||
      !snapshot.profile ||
      !Array.isArray(snapshot.meals)
    ) {
      return null;
    }

    return snapshot;
  } catch {
    return null;
  }
}

export function saveDashboardSnapshot(snapshot: Omit<DashboardSnapshot, "version" | "savedAt">) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      getCacheKey(snapshot.timeZone),
      JSON.stringify({
        ...snapshot,
        version: CACHE_VERSION,
        savedAt: new Date().toISOString(),
      } satisfies DashboardSnapshot),
    );
  } catch {
    // A full or unavailable local cache should never block the dashboard.
  }
}

export function clearDashboardSnapshots() {
  if (typeof window === "undefined") return;

  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(CACHE_KEY_PREFIX)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Account changes must continue even if local storage is unavailable.
  }
}