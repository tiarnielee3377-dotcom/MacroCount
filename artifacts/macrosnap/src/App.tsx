import { useState } from "react";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { getGetBillingEntitlementQueryKey, useGetBillingEntitlement } from '@workspace/api-client-react';
import Dashboard from './pages/dashboard';
import Billing from './pages/billing';
import Onboarding from './pages/onboarding';
import LogMeal from './pages/log-meal';
import Profile from './pages/profile';
import History from './pages/history';
import Recipes from './pages/recipes';
import Workouts from './pages/workouts';
import WorkoutFlow from './pages/workout-flow';
import { getDeviceTimeZone } from "@/lib/day";
import { readDashboardSnapshot } from "@/lib/offline-dashboard";

const queryClient = new QueryClient();

// Basic fallback for unknown routes
function NotFound() {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 text-center bg-background text-foreground">
       <h1 className="text-6xl font-bold mb-4 font-display text-primary">404</h1>
       <p className="text-muted-foreground mb-8">This page doesn't exist.</p>
      <button 
        onClick={() => setLocation("/dashboard")}
         className="h-14 px-8 bg-primary text-primary-foreground rounded-2xl font-bold"
      >
        Go Home
      </button>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/log" component={LogMeal} />
      <Route path="/profile" component={Profile} />
      <Route path="/billing" component={Billing} />
      <Route path="/history" component={History} />
      <Route path="/recipes" component={Recipes} />
      <Route path="/workouts/:workoutId" component={WorkoutFlow} />
      <Route path="/workouts" component={Workouts} />
      <Route component={NotFound} />
    </Switch>
  );
}

function EntitlementRouter() {
  const [location] = useLocation();
  const [hasCachedDashboard] = useState(() =>
    Boolean(readDashboardSnapshot(getDeviceTimeZone())),
  );
  const checkoutReturn = new URLSearchParams(window.location.search).get("checkout") === "success";
  const { data: entitlement, isLoading } = useGetBillingEntitlement({
    query: {
      queryKey: getGetBillingEntitlementQueryKey(),
      refetchInterval: checkoutReturn ? 2_000 : false,
      retry: false,
    },
  });
  const isBillingRoute = location === "/billing" || location === "/profile" || location === "/onboarding";

  if (isLoading && !isBillingRoute && !hasCachedDashboard) {
    return (
      <div className="min-h-[100dvh] bg-background text-foreground flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (entitlement?.status === "expired" && !isBillingRoute) {
    return <Billing />;
  }

  return <Router />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <EntitlementRouter />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
