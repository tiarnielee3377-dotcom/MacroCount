import { Link, useLocation } from "wouter";
import { Plus, Home, User, CalendarDays, BookOpen, Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const [location] = useLocation();
  const showMealAction = location !== "/recipes";

  return (
    <div className="fixed bottom-0 w-full max-w-md mx-auto z-50 pb-safe">
      {/* Floating Action Button */}
      {showMealAction && (
        <div className="absolute left-1/2 -translate-x-1/2 -top-14 z-10">
          <Link
            href="/log"
            aria-label="Log a meal"
            className="flex items-center justify-center w-14 h-14 bg-primary text-primary-foreground rounded-2xl border-4 border-background shadow-[0_10px_30px_rgba(255,107,53,0.28)] active:scale-95 transition-transform hover:scale-105"
          >
            <Plus className="w-6 h-6" strokeWidth={2.5} />
          </Link>
        </div>
      )}

      <nav className="h-[4.5rem] glass-panel border-t border-card-border bg-card/95 flex items-center justify-between px-3 rounded-t-[1.75rem] pb-2">
        <Link 
          href="/dashboard" 
          className={cn(
            "flex flex-col items-center justify-center w-12 h-12 rounded-2xl transition-colors",
            location === "/" || location === "/dashboard" ? "text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Home className="w-6 h-6" strokeWidth={location === "/" || location === "/dashboard" ? 2.5 : 2} />
        </Link>
        <Link
          href="/recipes"
          aria-label="Browse recipes"
          className={cn(
            "flex flex-col items-center justify-center w-10 h-12 rounded-2xl transition-colors",
            location === "/recipes" ? "text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <BookOpen className="w-5 h-5" strokeWidth={location === "/recipes" ? 2.5 : 2} />
        </Link>
        <Link
          href="/workouts"
          aria-label="Browse workouts"
          className={cn(
            "flex flex-col items-center justify-center w-10 h-12 rounded-2xl transition-colors",
            location.startsWith("/workouts") ? "text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Dumbbell className="w-5 h-5" strokeWidth={location.startsWith("/workouts") ? 2.5 : 2} />
        </Link>

        {/* Spacer for FAB */}
        {showMealAction && <div className="w-10" />}

        <Link
          href="/history"
          aria-label="View history"
          className={cn(
            "flex flex-col items-center justify-center w-10 h-12 rounded-2xl transition-colors",
            location === "/history" ? "text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <CalendarDays className="w-5 h-5" strokeWidth={location === "/history" ? 2.5 : 2} />
        </Link>

        <Link 
          href="/profile" 
          className={cn(
            "flex flex-col items-center justify-center w-12 h-12 rounded-2xl transition-colors",
            location === "/profile" ? "text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <User className="w-6 h-6" strokeWidth={location === "/profile" ? 2.5 : 2} />
        </Link>
      </nav>
    </div>
  );
}
