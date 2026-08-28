import { AnimatePresence, motion } from "framer-motion";
import { Award, Check, Flame, Sparkles, Trophy } from "lucide-react";
import { useEffect } from "react";

export type CelebrationMoment = {
  id: string;
  title: string;
  message: string;
  kind: "target" | "streak" | "best" | "challenge" | "badge";
};

const iconForKind = {
  target: Check,
  streak: Flame,
  best: Trophy,
  challenge: Sparkles,
  badge: Award,
} as const;

const accentForKind = {
  target: "bg-accent text-accent-foreground shadow-[0_18px_48px_rgba(0,214,143,0.26)]",
  streak: "bg-primary text-primary-foreground shadow-[0_18px_48px_rgba(255,107,53,0.26)]",
  best: "bg-primary text-primary-foreground shadow-[0_18px_48px_rgba(255,107,53,0.34)]",
  challenge: "bg-accent text-accent-foreground shadow-[0_18px_48px_rgba(0,214,143,0.26)]",
  badge: "bg-[#FFB020] text-background shadow-[0_18px_48px_rgba(255,176,32,0.24)]",
} as const;

export function CelebrationOverlay({
  moment,
  onDismiss,
}: {
  moment: CelebrationMoment | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!moment) return;
    const timer = window.setTimeout(onDismiss, moment.kind === "best" ? 2000 : 1500);
    return () => window.clearTimeout(timer);
  }, [moment, onDismiss]);

  return (
    <AnimatePresence>
      {moment && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-center justify-center px-7 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          aria-live="polite"
        >
          <div className="absolute inset-0 bg-background/45 backdrop-blur-[2px]" />
          {Array.from({ length: moment.kind === "best" ? 16 : 10 }).map((_, index) => (
            <motion.span
              key={index}
              className={`absolute h-2.5 w-2.5 rounded-sm ${index % 2 ? "bg-primary" : "bg-accent"}`}
              initial={{ opacity: 0, x: 0, y: 12, scale: 0.4, rotate: 0 }}
              animate={{
                opacity: [0, 1, 0],
                x: ((index % 4) - 1.5) * 72,
                y: -72 - (index % 5) * 22,
                scale: [0.4, 1, 0.7],
                rotate: 150 + index * 18,
              }}
              transition={{ duration: moment.kind === "best" ? 1.8 : 1.35, delay: index * 0.025 }}
            />
          ))}
          <motion.div
            className="relative w-full max-w-[19rem] rounded-[2rem] border border-white/10 bg-card p-6 text-center shadow-2xl"
            initial={{ opacity: 0, scale: 0.78, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -8 }}
            transition={{ type: "spring", stiffness: 330, damping: 22 }}
          >
            <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${accentForKind[moment.kind]}`}>
              {(() => {
                const Icon = iconForKind[moment.kind];
                return <Icon className="h-7 w-7" strokeWidth={2.5} />;
              })()}
            </div>
            <p className="font-display text-2xl font-bold text-foreground">{moment.title}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{moment.message}</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}