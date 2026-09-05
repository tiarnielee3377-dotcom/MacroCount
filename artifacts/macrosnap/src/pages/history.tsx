import {
  getGetProfileQueryKey,
  getGetProgressQueryKey,
  getGetWorkoutSummaryQueryKey,
  useGetProfile,
  useGetProgress,
  useGetWorkoutSummary,
} from "@workspace/api-client-react";
import { BottomNav } from "@/components/bottom-nav";
import { MobileLayout } from "@/components/layout";
import { getHistoryEmptyMessage, getStreakMessage } from "@/lib/copy";
import { CalendarDays, ChevronRight, Flame, Target, Dumbbell } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { getDeviceTimeZone } from "@/lib/day";

const displayDate = (date: string) =>
  new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short" }).format(
    new Date(`${date}T00:00:00`),
  );

export default function History() {
  const [, setLocation] = useLocation();
  const [emptyMessage] = useState(getHistoryEmptyMessage);
  const timeZone = getDeviceTimeZone();
  const { data: profile, isLoading: profileLoading } = useGetProfile({
    query: { queryKey: getGetProfileQueryKey(), retry: false },
  });
  const { data: progress, isLoading: progressLoading } = useGetProgress({ timeZone }, {
    query: { queryKey: getGetProgressQueryKey({ timeZone }), enabled: Boolean(profile), retry: false },
  });
  const { data: workoutSummary } = useGetWorkoutSummary({ timeZone }, {
    query: { queryKey: getGetWorkoutSummaryQueryKey({ timeZone }), enabled: Boolean(profile), retry: false },
  });

  useEffect(() => {
    if (!profileLoading && !profile) setLocation("/onboarding");
  }, [profile, profileLoading, setLocation]);

  if (!profileLoading && !profile) return null;

  return (
    <MobileLayout>
      <div className="flex-1 min-h-0 overflow-y-auto pb-32 hide-scrollbar">
        <header className="px-6 pb-6 pt-12">
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-primary">Your rhythm</p>
          <h1 className="font-display text-3xl font-bold text-foreground">History</h1>
        </header>

        {progressLoading || !progress ? (
          <div className="space-y-4 px-6 animate-pulse">
            <div className="h-36 rounded-3xl border border-card-border bg-card" />
            <div className="h-24 rounded-3xl border border-card-border bg-card" />
          </div>
        ) : (
          <div className="flex flex-col gap-6 px-6">
            <section className="rounded-3xl border border-primary/25 bg-primary/10 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                  <Flame className="h-6 w-6" fill="currentColor" />
                </div>
                <div>
                  <p className="font-display text-3xl font-bold text-foreground">
                    {progress.streak.current} day{progress.streak.current === 1 ? "" : "s"}
                  </p>
                  <p className="text-sm text-muted-foreground">Current logging streak</p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-foreground/85">
                {getStreakMessage(progress.streak.current, progress.streak.isBroken)}
              </p>
              <div className="mt-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-primary">
                <Target className="h-3.5 w-3.5" />
                Personal best: {progress.streak.longest} days
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Logged days
              </h2>
              {progress.history.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-card-border bg-card px-6 py-10 text-center">
                  <CalendarDays className="mx-auto mb-3 h-8 w-8 text-primary" />
                  <p className="text-sm leading-6 text-muted-foreground">{emptyMessage}</p>
                  <Link href="/log" className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-primary">
                    Log your first meal <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {progress.history.map((day) => (
                    <div key={day.date} className="rounded-2xl border border-card-border bg-card p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-foreground">{displayDate(day.date)}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {day.mealCount} meal{day.mealCount === 1 ? "" : "s"} · {Math.round(day.protein)}g protein
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-display text-xl font-bold text-foreground">{Math.round(day.calories)}</p>
                          <p className={`text-xs font-bold ${day.onTarget ? "text-accent" : "text-muted-foreground"}`}>
                            {day.onTarget ? "On target" : "Logged"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Workouts</h2>
              {!workoutSummary?.history.length ? (
                <Link href="/workouts" className="block rounded-3xl border border-dashed border-card-border bg-card px-6 py-7 text-center text-sm text-muted-foreground">Your completed workouts will appear here.</Link>
              ) : (
                <div className="flex flex-col gap-3">
                  {workoutSummary.history.map((workout) => (
                    <div key={workout.id} className="flex items-center gap-3 rounded-2xl border border-card-border bg-card p-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent"><Dumbbell className="h-5 w-5" /></div>
                      <div className="min-w-0 flex-1"><p className="font-medium text-foreground">{workout.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{new Date(workout.completedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })} · {Math.max(1, Math.round(workout.durationSeconds / 60))} min</p></div>
                      <p className="text-sm font-bold text-accent">{workout.caloriesBurned} kcal</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
      <BottomNav />
    </MobileLayout>
  );
}