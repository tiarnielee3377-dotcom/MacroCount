import { ReactNode } from "react";

export function MobileLayout({ children }: { children: ReactNode }) {
  return (
    <div className="h-[100dvh] min-h-[100dvh] max-w-md mx-auto relative bg-background overflow-hidden flex flex-col shadow-2xl sm:border-x sm:border-border">
      <div className="absolute -top-28 -right-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 -left-36 h-80 w-80 rounded-full bg-accent/5 blur-3xl pointer-events-none" />
      
      <main className="flex-1 min-h-0 flex flex-col relative z-10 w-full h-full">
        {children}
      </main>
    </div>
  );
}
