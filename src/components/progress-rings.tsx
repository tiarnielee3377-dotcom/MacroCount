import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ProgressRingProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  colorClass?: string;
  trackColorClass?: string;
  children?: React.ReactNode;
}

export function ProgressRing({
  progress,
  size = 120,
  strokeWidth = 8,
  colorClass = "text-primary",
  trackColorClass = "text-primary/10",
  children
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const safeProgress = Math.min(Math.max(progress, 0), 100);
  const offset = circumference - (safeProgress / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90 w-full h-full">
        {/* Track */}
        <circle
           className={cn("transition-colors duration-300", trackColorClass)}
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        {/* Progress */}
        <motion.circle
          className={cn("transition-colors duration-300", colorClass)}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

export function MacroBar({ 
  label, 
  current, 
  target,
  bgClass = "bg-secondary" 
}: { 
  label: string; 
  current: number; 
  target: number; 
  bgClass?: string;
}) {
  const percent = Math.min((current / target) * 100, 100);
  const overage = current > target;
  const progressColor = current === 0 ? "bg-secondary" : percent >= 100 ? "bg-accent" : "bg-[#FFB020]";
  
  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex justify-between items-end text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground text-xs">
          <span className={cn(overage && "text-destructive font-medium")}>{Math.round(current)}</span> / {target}g
        </span>
      </div>
      <div className={cn("h-3 w-full rounded-full overflow-hidden", bgClass)}>
         <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
           className={cn("h-full rounded-full", progressColor, overage && "bg-accent")}
        />
      </div>
    </div>
  );
}
