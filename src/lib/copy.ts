const pickRandom = (options: readonly string[]) =>
  options[Math.floor(Math.random() * options.length)];

const ON_TRACK_MEAL_MESSAGES = [
  "Nice, right on target.",
  "That's how it's done.",
  "Keeping the momentum going.",
] as const;

const OVER_TARGET_MEAL_MESSAGES = [
  "Noted — tomorrow's a fresh start.",
  "One meal doesn't undo your progress.",
  "No stress — keep going with the next one.",
] as const;

const DASHBOARD_EMPTY_MESSAGES = [
  "Nothing logged yet — snap your first meal to get started.",
  "Your day is ready when you are — log your first meal.",
  "Start the day strong with your first meal.",
] as const;

const HISTORY_EMPTY_MESSAGES = [
  "Your streak starts with today. Log a meal and make it count.",
  "No days logged yet — your first win is one meal away.",
  "This is a clean slate. Let's start your streak today.",
] as const;

export function getMealLoggedMessage(isOverTarget: boolean) {
  return pickRandom(isOverTarget ? OVER_TARGET_MEAL_MESSAGES : ON_TRACK_MEAL_MESSAGES);
}

export function getDashboardEmptyMessage() {
  return pickRandom(DASHBOARD_EMPTY_MESSAGES);
}

export function getHistoryEmptyMessage() {
  return pickRandom(HISTORY_EMPTY_MESSAGES);
}

export function getStreakMessage(days: number, wasBroken = false) {
  if (wasBroken) return "Streaks reset, progress doesn't. Let's start a new one today.";
  if (days === 1) return "Day one strong — this is how habits begin.";
  if (days === 7) return "One week in — this is becoming a habit.";
  return `${days} days strong. Keep it going.`;
}