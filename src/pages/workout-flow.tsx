import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useCompleteWorkout, useListWorkouts, getGetWorkoutSummaryQueryKey } from "@workspace/api-client-react";
import { ArrowLeft, Check, Dumbbell, Pause, Play, Timer, X } from "lucide-react";
import { MobileLayout } from "@/components/layout";
import { CelebrationOverlay, type CelebrationMoment } from "@/components/celebration";
import { getDeviceTimeZone } from "@/lib/day";

const REST_SECONDS = 15;

export default function WorkoutFlow() {
  const [, params] = useRoute("/workouts/:workoutId");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const timeZone = getDeviceTimeZone();
  const { data: workouts } = useListWorkouts();
  const workout = useMemo(() => workouts?.find((item) => item.id === params?.workoutId), [workouts, params?.workoutId]);
  const completeWorkout = useCompleteWorkout();
  const startedAt = useRef(Date.now());
  const completionStarted = useRef(false);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"exercise" | "rest" | "complete">("exercise");
  const [paused, setPaused] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [celebration, setCelebration] = useState<CelebrationMoment | null>(null);
  const exercise = workout?.exercises[index];

  useEffect(() => {
    if (!exercise || phase !== "exercise") return;
    setSecondsLeft(exercise.mode === "duration" ? exercise.durationSeconds ?? 30 : null);
  }, [exercise?.id, phase]);

  useEffect(() => {
    if (paused || secondsLeft === null || phase === "complete") return;
    if (secondsLeft <= 0) {
      if (phase === "rest") {
        setIndex((value) => value + 1);
        setPaused(false);
        setPhase("exercise");
      } else {
        advance();
      }
      return;
    }
    const timer = window.setTimeout(() => setSecondsLeft((value) => (value ?? 1) - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft, paused, phase]);

  useEffect(() => {
    if (phase !== "complete" || !workout || completionStarted.current) return;
    completionStarted.current = true;
    persistCompletion();
  }, [phase, workout, completeWorkout, queryClient, timeZone]);

  const persistCompletion = () => {
    if (!workout) return;
    setSaveState("saving");
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
    completeWorkout.mutate(
      { workoutId: workout.id, data: { durationSeconds } },
      {
        onSuccess: () => {
          setSaveState("saved");
          queryClient.invalidateQueries({ queryKey: getGetWorkoutSummaryQueryKey({ timeZone }) });
          setCelebration({ id: "workout-complete", kind: "best", title: "Workout complete", message: "You showed up for yourself. That counts." });
        },
        onError: () => setSaveState("error"),
      },
    );
  };

  const advance = () => {
    if (!workout) return;
    if (index >= workout.exercises.length - 1) {
      setPhase("complete");
      return;
    }
    setPaused(false);
    setPhase("rest");
    setSecondsLeft(REST_SECONDS);
  };

  const beginNext = () => {
    setIndex((value) => value + 1);
    setPaused(false);
    setPhase("exercise");
  };

  if (!workout || !exercise) {
    return <MobileLayout><div className="flex flex-1 items-center justify-center p-6 text-muted-foreground">Loading workout…</div></MobileLayout>;
  }

  if (phase === "complete") {
    return (
      <MobileLayout>
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-accent text-accent-foreground shadow-[0_18px_48px_rgba(0,214,143,0.26)]"><Check className="h-10 w-10" strokeWidth={3} /></div>
          <p className="mt-7 text-xs font-bold uppercase tracking-[0.18em] text-accent">{saveState === "saved" ? "Session saved" : saveState === "error" ? "Save needs attention" : "Saving session"}</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-foreground">Workout complete</h1>
          <p className="mt-3 max-w-xs text-sm leading-6 text-muted-foreground">{saveState === "error" ? "Your workout finished, but the save did not go through. Retry to add it to today’s summary." : saveState === "saved" ? "Nice work. Your estimated calorie burn is now part of today’s summary." : "Saving your estimated calorie burn now."}</p>
          {saveState === "error" ? (
            <button onClick={persistCompletion} className="mt-8 h-14 w-full rounded-2xl bg-primary font-bold text-primary-foreground">Retry saving workout</button>
          ) : (
            <button onClick={() => setLocation("/dashboard")} disabled={saveState !== "saved"} className="mt-8 h-14 w-full rounded-2xl bg-primary font-bold text-primary-foreground disabled:opacity-60">Back to dashboard</button>
          )}
          {saveState === "saved" && <button onClick={() => setLocation("/workouts")} className="mt-3 h-12 w-full rounded-2xl bg-secondary font-bold text-secondary-foreground">Choose another routine</button>}
        </div>
        <CelebrationOverlay moment={celebration} onDismiss={() => setCelebration(null)} />
      </MobileLayout>
    );
  }

  const isRest = phase === "rest";
  const displaySeconds = secondsLeft ?? 0;
  return (
    <MobileLayout>
      <div className="flex flex-1 flex-col px-5 pb-7 pt-7">
        <header className="flex items-center justify-between">
          <button onClick={() => setLocation("/workouts")} aria-label="Exit workout" className="flex h-11 w-11 items-center justify-center rounded-2xl bg-card text-foreground"><ArrowLeft className="h-5 w-5" /></button>
          <div className="text-center"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{workout.category.replace("-", " ")}</p><p className="text-xs text-muted-foreground">Move {index + 1} of {workout.exercises.length}</p></div>
          <button onClick={() => setLocation("/workouts")} aria-label="Exit workout" className="flex h-11 w-11 items-center justify-center rounded-2xl bg-card text-muted-foreground"><X className="h-5 w-5" /></button>
        </header>
        <div className="mt-7 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary transition-all" style={{ width: `${((index + (isRest ? 0.5 : 0)) / workout.exercises.length) * 100}%` }} /></div>
        <main className="flex flex-1 flex-col items-center justify-center text-center">
          <div className={`flex h-24 w-24 items-center justify-center rounded-[2rem] ${isRest ? "bg-[#FFB020] text-background" : "bg-primary text-primary-foreground"}`}><>{isRest ? <Timer className="h-11 w-11" /> : <Dumbbell className="h-11 w-11" />}</></div>
          <p className="mt-7 text-xs font-bold uppercase tracking-[0.18em] text-primary">{isRest ? "Recovery" : exercise.mode === "duration" ? "Timed move" : "Rep move"}</p>
          <h1 className="mt-2 font-display text-4xl font-bold text-foreground">{isRest ? "Rest and reset" : exercise.name}</h1>
          <p className="mt-4 max-w-sm text-base leading-7 text-muted-foreground">{isRest ? "Breathe, shake it out, and get ready for the next move." : exercise.instruction}</p>
          {isRest || exercise.mode === "duration" ? <p className="mt-8 font-display text-7xl font-bold text-foreground">{String(Math.floor(displaySeconds / 60)).padStart(2, "0")}:{String(displaySeconds % 60).padStart(2, "0")}</p> : <p className="mt-8 font-display text-7xl font-bold text-foreground">{exercise.reps}</p>}
          {!isRest && exercise.mode === "reps" && <p className="mt-2 text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground">reps</p>}
        </main>
        <div className="space-y-3">
          {(isRest || exercise.mode === "duration") && <button onClick={() => setPaused((value) => !value)} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-secondary font-bold text-secondary-foreground">{paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}{paused ? "Resume timer" : "Pause timer"}</button>}
          <button onClick={isRest ? beginNext : advance} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary font-bold text-primary-foreground">{isRest ? "Start next move" : exercise.mode === "reps" ? "Done — next" : "Skip to next"} <Check className="h-5 w-5" /></button>
        </div>
      </div>
    </MobileLayout>
  );
}