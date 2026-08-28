import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

export function formatTime(date: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

export function calculateTargets(weightKg: number, goal: string, activityLevel: string) {
  // Simple BMR
  const bmr = weightKg * 22;
  
  // Activity Multiplier
  let multiplier = 1.2;
  switch (activityLevel) {
    case 'sedentary': multiplier = 1.2; break;
    case 'lightly_active': multiplier = 1.375; break;
    case 'active': multiplier = 1.55; break;
    case 'very_active': multiplier = 1.725; break;
  }
  
  const tdee = Math.round(bmr * multiplier);
  
  // Goal Modifier
  let calorieTarget = tdee;
  if (goal === 'lose') calorieTarget -= 500;
  if (goal === 'gain') calorieTarget += 500;
  
  // Macros
  const proteinTarget = Math.round(weightKg * 2); // 2g per kg
  const fatTarget = Math.round((calorieTarget * 0.3) / 9); // 30% from fat
  const carbsTarget = Math.round((calorieTarget - (proteinTarget * 4) - (fatTarget * 9)) / 4);
  
  return {
    calorieTarget,
    proteinTarget,
    carbsTarget: Math.max(0, carbsTarget),
    fatTarget,
  };
}
