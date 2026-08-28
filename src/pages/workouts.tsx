import { Link } from "wouter";
import { useListWorkouts } from "@workspace/api-client-react";
import { Dumbbell, ArrowRight, Clock3, Repeat2, Timer } from "lucide-react";
import { MobileLayout } from "@/components/layout";
import { BottomNav } from "@/components/bottom-nav";

const accentByCategory = {
  "full-body": "from-primary to-[#FFB020]",
  "upper-body": "from-[#8B5CF6] to-[#60A5FA]",
  "lower-body": "from-accent to-[#33E3A6]",
  core: "from-[#F43F5E] to-[#FB7185]",
};

export default function Workouts() {
  const { data: workouts, isLoading, isError } = useListWorkouts();

  return (
    <MobileLayout>
      <div className="flex-1 min-h-0 overflow-y-auto pb-32 hide-scrollbar">
        <header className="px-5 pb-6 pt-8">
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-primary">Move your way</p>
          <h1 className="font-display text-3xl font-bold text-foreground">Workouts</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">No equipment. One focused move at a time.</p>
        </header>

        <section className="mx-5 mb-7 rounded-[2rem] border border-accent/25 bg-accent/10 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              <Dumbbell className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Guided and simple</p>
              <h2 className="mt-1 font-display text-xl font-bold text-foreground">Pick a focus, then follow along</h2>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">Every routine blends timed holds with rep-based moves and short recovery breaks.</p>
            </div>
          </div>
        </section>

        <section className="px-5">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Choose a routine</h2>
          {isLoading ? (
            <div className="space-y-4 animate-pulse">{[1, 2, 3, 4].map((item) => <div key={item} className="h-48 rounded-3xl border border-card-border bg-card" />)}</div>
          ) : isError ? (
            <div className="rounded-3xl border border-destructive/30 bg-destructive/10 p-6 text-center text-sm text-destructive">We couldn't load workouts. Please try again.</div>
          ) : (
            <div className="space-y-4">
              {workouts?.map((workout) => (
                <article key={workout.id} className="overflow-hidden rounded-[2rem] border border-card-border bg-card">
                  <div className={`h-2 bg-gradient-to-r ${accentByCategory[workout.category]}`} />
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{workout.category.replace("-", " ")}</p>
                        <h3 className="mt-1 font-display text-2xl font-bold text-foreground">{workout.name}</h3>
                      </div>
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary"><Dumbbell className="h-5 w-5" /></div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{workout.description}</p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-muted-foreground">
                      <span className="inline-flex items-center gap-1 rounded-xl bg-secondary px-3 py-2"><Clock3 className="h-3.5 w-3.5" /> ~{workout.estimatedMinutes} min</span>
                      <span className="inline-flex items-center gap-1 rounded-xl bg-secondary px-3 py-2"><Repeat2 className="h-3.5 w-3.5" /> {workout.exercises.length} moves</span>
                      <span className="inline-flex items-center gap-1 rounded-xl bg-secondary px-3 py-2"><Timer className="h-3.5 w-3.5" /> rests included</span>
                    </div>
                    <div className="mt-4 rounded-2xl bg-background p-3 text-xs leading-5 text-muted-foreground">
                      Starts with <span className="font-bold text-foreground">{workout.exercises[0]?.name}</span> · {workout.exercises.slice(1, 3).map((exercise) => exercise.name).join(" · ")}
                    </div>
                    <Link href={`/workouts/${workout.id}`} className="mt-4 flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary font-bold text-primary-foreground active:scale-[0.98]">
                      Start workout <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
      <BottomNav />
    </MobileLayout>
  );
}