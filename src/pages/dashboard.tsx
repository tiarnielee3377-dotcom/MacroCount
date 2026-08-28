import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { 
  useGetProfile, 
  useListMeals, 
  useDeleteMeal,
  useGetProgress,
  useGetWorkoutSummary,
  getGetProfileQueryKey,
  getGetProgressQueryKey,
  getGetWorkoutSummaryQueryKey,
  getListMealsQueryKey
} from "@workspace/api-client-react";
import type { MacroProgress } from "@workspace/api-client-react";
import { MobileLayout } from "@/components/layout";
import { BottomNav } from "@/components/bottom-nav";
import { ProgressRing, MacroBar } from "@/components/progress-rings";
import { formatTime } from "@/lib/utils";
import { Award, CheckCircle2, Flame, Plus, Trash2, Camera, BookOpen, Dumbbell } from "lucide-react";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getDashboardEmptyMessage, getMealLoggedMessage } from "@/lib/copy";
import { CelebrationOverlay, type CelebrationMoment } from "@/components/celebration";
import { getDeviceTimeZone, getLocalDay } from "@/lib/day";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [date] = useState(getLocalDay);
  const timeZone = getDeviceTimeZone();
  const [mealMomentMessage, setMealMomentMessage] = useState<string | null>(null);
  const [dashboardEmptyMessage] = useState(() => getDashboardEmptyMessage());
  const [celebration, setCelebration] = useState<CelebrationMoment | null>(null);
  
  const { data: profile, isLoading: isProfileLoading } = useGetProfile({
    query: {
      queryKey: getGetProfileQueryKey(),
      retry: false
    }
  });

  const { data: meals, isLoading: isMealsLoading } = useListMeals({ date, timeZone }, {
    query: {
      queryKey: getListMealsQueryKey({ date, timeZone }),
      enabled: !!profile,
    }
  });

  const deleteMeal = useDeleteMeal();
  const { data: progress } = useGetProgress({ timeZone }, {
    query: {
      queryKey: getGetProgressQueryKey({ timeZone }),
      enabled: !!profile,
      retry: false,
    },
  });
  const { data: workoutSummary } = useGetWorkoutSummary({ timeZone }, {
    query: { queryKey: getGetWorkoutSummaryQueryKey({ timeZone }), enabled: !!profile, retry: false },
  });

  useEffect(() => {
    if (!profile) return;
    const rawHandoff = window.sessionStorage.getItem("macrosnap:progress-handoff");
    if (!rawHandoff) return;

    let handoff: { before: MacroProgress; after: MacroProgress; timeZone: string } | null = null;
    try {
      handoff = JSON.parse(rawHandoff) as { before: MacroProgress; after: MacroProgress; timeZone: string };
    } catch {
      handoff = null;
    }
    window.sessionStorage.removeItem("macrosnap:progress-handoff");
    if (!handoff || handoff.timeZone !== timeZone) return;

    const today = date;
    const { before, after } = handoff;
    const currentDay = after.history.find((day) => day.date === today);
    const beforeDay = before.history.find((day) => day.date === today);
    const totalCalories = currentDay?.calories ?? 0;
    const newlyUnlocked = after.achievements.find(
      (achievement) =>
        achievement.unlocked &&
        !before.achievements.some(
          (previousAchievement) =>
            previousAchievement.id === achievement.id && previousAchievement.unlocked,
        ),
    );
    const hitMacroTarget = Boolean(
      currentDay &&
        (currentDay.protein >= profile.proteinTarget && (beforeDay?.protein ?? 0) < profile.proteinTarget ||
          currentDay.carbs >= profile.carbsTarget && (beforeDay?.carbs ?? 0) < profile.carbsTarget ||
          currentDay.fat >= profile.fatTarget && (beforeDay?.fat ?? 0) < profile.fatTarget),
    );
    const hitCalorieTarget = Boolean(currentDay?.onTarget && !beforeDay?.onTarget);
    const completedChallenge =
      after.dailyChallenge.completed && !before.dailyChallenge.completed;
    const newPersonalBest = Boolean(
      before.streak.longest > 0 && after.streak.current > before.streak.longest,
    );
    const streakIncreased = after.streak.current > before.streak.current;

    setMealMomentMessage(getMealLoggedMessage(totalCalories > profile.calorieTarget));
    if (newPersonalBest) {
      setCelebration({
        id: "personal-best",
        kind: "best",
        title: "New personal best",
        message: `${after.streak.current} days in a row. You’re building something real.`,
      });
    } else if (newlyUnlocked) {
      setCelebration({
        id: newlyUnlocked.id,
        kind: "badge",
        title: "Badge unlocked",
        message: `${newlyUnlocked.name} — ${newlyUnlocked.description}`,
      });
    } else if (completedChallenge) {
      setCelebration({
        id: "challenge",
        kind: "challenge",
        title: "Challenge complete",
        message: "A small win that moves your routine forward.",
      });
    } else if (hitCalorieTarget || hitMacroTarget) {
      setCelebration({
        id: "target",
        kind: "target",
        title: "Target reached",
        message: hitCalorieTarget
          ? "Your calories are right in today’s target zone."
          : "You just completed one of today’s macro targets.",
      });
    } else if (streakIncreased) {
      setCelebration({
        id: "streak",
        kind: "streak",
        title: `${after.streak.current}-day streak`,
        message: "Consistency looks good on you.",
      });
    }
  }, [date, profile, timeZone]);

  if (isProfileLoading) {
    return (
      <MobileLayout>
        <div className="flex-1 p-6 pt-12 space-y-5 animate-pulse">
          <div className="h-4 w-28 rounded-full bg-secondary" />
          <div className="h-9 w-64 rounded-xl bg-secondary" />
          <div className="h-80 rounded-[2rem] bg-card border border-card-border" />
          <div className="h-48 rounded-3xl bg-card border border-card-border" />
        </div>
      </MobileLayout>
    );
  }

  // If no profile, we should ideally redirect in a layout or hook, but let's handle here.
  // Assuming the API returns 404 when no profile, which react-query treats as error.
  if (!profile) {
    // Return empty state that links to onboarding
    return (
      <MobileLayout>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 bg-primary/15 text-primary rounded-3xl flex items-center justify-center mb-6">
            <Camera className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-display font-bold mb-2">Welcome to MacroCount</h1>
          <p className="text-muted-foreground mb-8">Your personal, no-stress nutrition coach.</p>
          <div className="flex w-full flex-col gap-3">
            <button 
              onClick={() => setLocation("/onboarding")}
              className="h-14 px-8 bg-primary text-primary-foreground rounded-2xl font-bold w-full"
            >
              Get Started
            </button>
            <button
              onClick={() => setLocation("/profile?account=login")}
              className="h-12 px-8 bg-secondary text-secondary-foreground rounded-2xl font-bold w-full"
            >
              Sign in / Restore progress
            </button>
          </div>
        </div>
      </MobileLayout>
    );
  }

  const consumed = {
    calories: meals?.reduce((sum, m) => sum + m.calories, 0) || 0,
    protein: meals?.reduce((sum, m) => sum + m.protein, 0) || 0,
    carbs: meals?.reduce((sum, m) => sum + m.carbs, 0) || 0,
    fat: meals?.reduce((sum, m) => sum + m.fat, 0) || 0,
  };

  const calsPercent = Math.min((consumed.calories / profile.calorieTarget) * 100, 100);
  const calorieRingColor =
    consumed.calories === 0
      ? "text-secondary"
      : calsPercent >= 100
        ? "text-accent"
        : "text-[#FFB020]";

  const handleDelete = (id: number) => {
    deleteMeal.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMealsQueryKey({ date, timeZone }) });
        queryClient.invalidateQueries({ queryKey: getGetProgressQueryKey({ timeZone }) });
      }
    });
  };

  return (
    <MobileLayout>
      <div className="flex-1 min-h-0 overflow-y-auto pb-32 hide-scrollbar">
        {/* Header */}
        <header className="pt-8 pb-6 px-5">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary mb-1">Today’s summary</p>
              <h1 className="text-3xl leading-none font-display font-bold text-foreground">You're doing great</h1>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/recipes" aria-label="Browse recipes" className="w-11 h-11 bg-primary/15 rounded-2xl flex items-center justify-center text-primary border border-primary/20">
                <BookOpen className="w-5 h-5" />
              </Link>
              <Link href="/workouts" aria-label="Open guided workouts" className="w-11 h-11 bg-accent/15 rounded-2xl flex items-center justify-center text-accent border border-accent/20">
                <Dumbbell className="w-5 h-5" />
              </Link>
              <Link href="/history" aria-label="Open progress history" className="w-11 h-11 bg-primary/15 rounded-2xl flex items-center justify-center text-primary border border-primary/20">
                <Flame className="w-5 h-5 fill-accent/20" />
              </Link>
            </div>
          </div>
          {mealMomentMessage && (
            <p className="mt-4 text-sm font-semibold text-accent">{mealMomentMessage}</p>
          )}
        </header>

        {/* Primary Target Ring */}
        <div className="px-5 flex justify-center mb-8">
          <div className="relative p-6 bg-card rounded-[2rem] border border-card-border w-full flex flex-col items-center">
            <ProgressRing progress={calsPercent} size={180} strokeWidth={14} colorClass={calorieRingColor} trackColorClass="text-secondary">
              <div className="text-center mt-2">
                <span className="block text-5xl font-display font-bold text-foreground tracking-tight">
                  {Math.round(profile.calorieTarget - consumed.calories)}
                </span>
                <span className="text-xs text-muted-foreground font-bold uppercase tracking-[0.18em]">Left</span>
              </div>
            </ProgressRing>
            
            <div className="flex justify-between w-full mt-6 px-4">
              <div className="text-center">
                <span className="block text-sm text-muted-foreground">Eaten</span>
                <span className="block font-medium text-foreground">{Math.round(consumed.calories)}</span>
              </div>
              <div className="text-center">
                <span className="block text-sm text-muted-foreground">Target</span>
                <span className="block font-medium text-foreground">{profile.calorieTarget}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 mb-8">
          <Link href="/workouts" className="flex items-center justify-between rounded-3xl border border-accent/25 bg-accent/10 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground"><Dumbbell className="h-6 w-6" /></div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Movement today</p>
                <p className="mt-1 font-display text-xl font-bold text-foreground">{workoutSummary?.today.caloriesBurned ?? 0} kcal burned</p>
              </div>
            </div>
            <span className="text-xs font-bold text-muted-foreground">{workoutSummary?.today.workoutCount ?? 0} workout{(workoutSummary?.today.workoutCount ?? 0) === 1 ? "" : "s"}</span>
          </Link>
        </div>

        {/* Macros */}
        <div className="px-5 mb-8">
          <h3 className="text-xs font-bold text-muted-foreground mb-4 uppercase tracking-[0.18em]">Macros</h3>
          <div className="p-5 bg-card rounded-3xl border border-card-border flex flex-col gap-5">
            <MacroBar label="Protein" current={consumed.protein} target={profile.proteinTarget} bgClass="bg-secondary" />
            <MacroBar label="Carbs" current={consumed.carbs} target={profile.carbsTarget} bgClass="bg-secondary" />
            <MacroBar label="Fat" current={consumed.fat} target={profile.fatTarget} bgClass="bg-secondary" />
          </div>
        </div>
        
        {progress && (
          <div className="px-5 mb-8">
            <div className="rounded-3xl border border-card-border bg-card p-5">
              <div className="mb-3 flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Today’s challenge</p>
                  <h3 className="mt-1 font-display text-xl font-bold text-foreground">{progress.dailyChallenge.title}</h3>
                </div>
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${progress.dailyChallenge.completed ? "bg-accent text-accent-foreground" : "bg-primary/15 text-primary"}`}>
                  {progress.dailyChallenge.completed ? <CheckCircle2 className="h-5 w-5" /> : <Award className="h-5 w-5" />}
                </div>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">{progress.dailyChallenge.description}</p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-secondary">
                <motion.div
                  className={progress.dailyChallenge.completed ? "h-full bg-accent" : "h-full bg-primary"}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min((progress.dailyChallenge.progress / progress.dailyChallenge.target) * 100, 100)}%` }}
                />
              </div>
              <p className={`mt-2 text-xs font-bold ${progress.dailyChallenge.completed ? "text-accent" : "text-muted-foreground"}`}>
                {progress.dailyChallenge.completed
                  ? "Complete — nicely done."
                  : `${Math.round(progress.dailyChallenge.progress)} / ${Math.round(progress.dailyChallenge.target)}`}
              </p>
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="px-5 mb-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.18em]">Meals</h3>
            <Link href="/log" className="text-primary text-sm font-bold flex items-center gap-1">
              <Plus className="w-4 h-4" /> Add meal
            </Link>
          </div>

          <div className="flex flex-col gap-3">
            {isMealsLoading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-20 rounded-2xl bg-card border border-card-border" />
                <div className="h-20 rounded-2xl bg-card border border-card-border" />
              </div>
            ) : meals?.length === 0 ? (
              <div className="py-8 text-center bg-card rounded-2xl border border-dashed border-card-border">
                <p className="text-muted-foreground text-sm">{dashboardEmptyMessage}</p>
              </div>
            ) : (
              <AnimatePresence>
                {meals?.map((meal) => (
                  <motion.div 
                    key={meal.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="p-4 bg-card rounded-2xl border border-card-border flex items-center gap-4"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center font-display font-bold text-lg shrink-0">
                      {meal.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-0.5">
                        <h4 className="font-medium text-foreground truncate pr-2">{meal.name}</h4>
                          <span className="text-xs font-bold bg-secondary text-secondary-foreground px-2.5 py-1 rounded-lg shrink-0">
                          {Math.round(meal.calories)} kcal
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <p className="text-xs text-muted-foreground">
                          {formatTime(meal.loggedAt)} • {meal.mealType}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {Math.round(meal.protein)}P • {Math.round(meal.carbs)}C • {Math.round(meal.fat)}F
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleDelete(meal.id)}
                      className="w-8 h-8 rounded-full bg-destructive/10 text-destructive flex items-center justify-center shrink-0 opacity-80 hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>
      
      <BottomNav />
      <CelebrationOverlay moment={celebration} onDismiss={() => setCelebration(null)} />
    </MobileLayout>
  );
}
