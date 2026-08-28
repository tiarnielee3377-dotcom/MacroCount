import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { getGetBillingEntitlementQueryKey, useSaveProfile } from "@workspace/api-client-react";
import { calculateTargets, cn } from "@/lib/utils";
import { MobileLayout } from "@/components/layout";
import { ChevronRight, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const GOALS = [
  { id: "lose", label: "Lose Weight", desc: "Steady, sustainable loss" },
  { id: "maintain", label: "Maintain", desc: "Keep it right here" },
  { id: "gain", label: "Build Muscle", desc: "Fuel your gains" },
] as const;

const ACTIVITY_LEVELS = [
  { id: "sedentary", label: "Sedentary", desc: "Mostly sitting" },
  { id: "lightly_active", label: "Lightly Active", desc: "1-3 days of exercise" },
  { id: "active", label: "Active", desc: "3-5 days of exercise" },
  { id: "very_active", label: "Very Active", desc: "6-7 days of exercise" },
] as const;

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [weight, setWeight] = useState("");
  const [goal, setGoal] = useState<"lose" | "maintain" | "gain">("maintain");
  const [activity, setActivity] = useState<"sedentary" | "lightly_active" | "active" | "very_active">("lightly_active");

  const saveProfile = useSaveProfile();

  const handleNext = () => setStep((s) => s + 1);

  const handleComplete = () => {
    const targets = calculateTargets(Number(weight), goal, activity);
    
    saveProfile.mutate({
      data: {
        weight: Number(weight),
        goal,
        activityLevel: activity,
        ...targets
      }
    }, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetBillingEntitlementQueryKey() });
        setLocation("/dashboard");
      }
    });
  };

  return (
    <MobileLayout>
      <div className="flex flex-col min-h-0 h-full px-5 pt-8 pb-7">
        <div className="flex justify-between items-center mb-10">
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <div 
                key={i} 
                className={cn(
                   "h-1.5 rounded-full transition-all duration-300",
                   step >= i ? "bg-primary w-8" : "bg-secondary w-3"
                )}
              />
            ))}
          </div>
          <button 
            onClick={() => setLocation("/dashboard")} 
            className="text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            I'll do this later
          </button>
        </div>

        <div className="flex-1 min-h-0 relative">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="absolute inset-0 flex flex-col"
              >
                <div className="mb-8">
                   <div className="w-12 h-12 bg-primary/15 text-primary rounded-2xl flex items-center justify-center mb-6">
                    <Sparkles className="w-6 h-6" />
                  </div>
                   <h1 className="text-4xl leading-[1.05] font-display font-bold text-foreground mb-3">
                    Let's set your baseline
                  </h1>
                   <p className="text-muted-foreground leading-relaxed">
                    We'll use this to calculate your daily targets. No judgment, just data.
                  </p>
                </div>

                <div className="mt-8">
                   <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Current weight (kg)</label>
                  <input
                    type="number"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="e.g. 70"
                     className="w-full text-6xl font-display font-bold bg-transparent border-b-2 border-border focus:border-primary pb-3 outline-none transition-colors placeholder:text-muted-foreground/50 text-center text-foreground"
                    autoFocus
                  />
                </div>

                <div className="mt-auto">
                  <button
                    onClick={handleNext}
                    disabled={!weight || Number(weight) <= 0}
                     className="w-full h-14 bg-primary text-primary-foreground rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity active:scale-[0.98]"
                  >
                    Keep going <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="absolute inset-0 flex flex-col"
              >
                 <h1 className="text-4xl leading-[1.05] font-display font-bold text-foreground mb-8">
                  What's the goal?
                </h1>

                <div className="flex flex-col gap-3">
                  {GOALS.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setGoal(g.id)}
                      className={cn(
                         "p-5 rounded-2xl border text-left transition-all active:scale-[0.98]",
                        goal === g.id 
                           ? "border-primary bg-primary/10" 
                           : "border-card-border bg-card hover:bg-secondary"
                      )}
                    >
                       <h3 className={cn("font-display font-bold text-lg", goal === g.id ? "text-primary" : "text-foreground")}>
                        {g.label}
                      </h3>
                      <p className="text-muted-foreground text-sm mt-1">{g.desc}</p>
                    </button>
                  ))}
                </div>

                <div className="mt-auto flex gap-3">
                  <button
                    onClick={() => setStep(1)}
                     className="h-14 px-6 rounded-2xl font-bold text-foreground bg-secondary active:scale-[0.98]"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleNext}
                     className="flex-1 h-14 bg-primary text-primary-foreground rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-[0.98]"
                  >
                    Keep going <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="absolute inset-0 flex flex-col"
              >
                 <h1 className="text-4xl leading-[1.05] font-display font-bold text-foreground mb-8">
                  How active are you?
                </h1>

                <div className="flex flex-col gap-3 overflow-y-auto hide-scrollbar pb-4">
                  {ACTIVITY_LEVELS.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setActivity(a.id)}
                      className={cn(
                         "p-5 rounded-2xl border text-left transition-all active:scale-[0.98]",
                        activity === a.id 
                           ? "border-primary bg-primary/10" 
                           : "border-card-border bg-card hover:bg-secondary"
                      )}
                    >
                       <h3 className={cn("font-display font-bold text-lg", activity === a.id ? "text-primary" : "text-foreground")}>
                        {a.label}
                      </h3>
                      <p className="text-muted-foreground text-sm mt-1">{a.desc}</p>
                    </button>
                  ))}
                </div>

                <div className="mt-auto pt-4 flex gap-3 bg-background relative z-10">
                  <button
                    onClick={() => setStep(2)}
                     className="h-14 px-6 rounded-2xl font-bold text-foreground bg-secondary active:scale-[0.98]"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleComplete}
                    disabled={saveProfile.isPending}
                     className="flex-1 h-14 bg-primary text-primary-foreground rounded-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-70 active:scale-[0.98]"
                  >
                    {saveProfile.isPending ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>Let's go <ChevronRight className="w-5 h-5" /></>
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </MobileLayout>
  );
}
