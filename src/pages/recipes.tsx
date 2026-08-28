import { useState, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Drawer } from "vaul";
import { motion, AnimatePresence } from "framer-motion";
import {
  useListRecipes,
  useGetRecipeRecommendations,
  useCreateMeal,
  useDeleteMealPlanSlot,
  useGetGroceryList,
  useGetMealPlan,
  useSaveGroceryItemCheck,
  useSaveMealPlanSlot,
  getListRecipesQueryKey,
  getListMealsQueryKey,
  getGetProgressQueryKey,
  getGetRecipeRecommendationsQueryKey,
  getGetGroceryListQueryKey,
  getGetMealPlanQueryKey,
  Recipe
} from "@workspace/api-client-react";
import { getDeviceTimeZone, getLocalDay, getLocalWeekStart, shiftLocalDay } from "@/lib/day";
import { MobileLayout } from "@/components/layout";
import { BottomNav } from "@/components/bottom-nav";
import { Search, Plus, Check, Sparkles, Utensils, ChefHat, BookOpen, CalendarDays, ShoppingBasket, X } from "lucide-react";

const COLOR_GRADIENTS = [
  "from-[#FF6B35] to-[#FF8C61]", // Primary Citrus
  "from-[#00D68F] to-[#33E3A6]", // Accent Green
  "from-[#FFB020] to-[#FFC555]", // Warning Amber
  "from-[#F43F5E] to-[#FB7185]", // Rose
  "from-[#8B5CF6] to-[#A78BFA]", // Purple
  "from-[#0EA5E9] to-[#60A5FA]", // Blue
];

const getGradientForRecipe = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLOR_GRADIENTS[Math.abs(hash) % COLOR_GRADIENTS.length];
};

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
type MealTypeFilter = typeof MEAL_TYPES[number];
type RecipeView = "library" | "plan" | "groceries";
const PLAN_SLOTS = ["breakfast", "lunch", "dinner"] as const;

function RecipeVisual({
  recipe,
  className,
  children,
  fallback,
}: {
  recipe: Recipe;
  className: string;
  children?: React.ReactNode | ((hasImage: boolean) => React.ReactNode);
  fallback?: React.ReactNode;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = imageFailed ? null : recipe.imageUrl;
  const hasImage = Boolean(imageUrl);

  useEffect(() => {
    setImageFailed(false);
  }, [recipe.imageUrl]);

  const renderedChildren = typeof children === "function" ? children(hasImage) : children;

  return (
    <div className={`bg-gradient-to-br ${getGradientForRecipe(recipe.id)} overflow-hidden relative ${className}`}>
      {hasImage ? (
        <img
          src={imageUrl ?? undefined}
          alt={recipe.name}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <>
          <div className="absolute inset-0 opacity-20 mix-blend-overlay bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz4KPC9zdmc+')]"></div>
          {fallback}
        </>
      )}
      {renderedChildren}
    </div>
  );
}

function RecipeCard({ 
  recipe, 
  onInspect, 
  onLog,
  isLogging,
  isLogged
}: { 
  recipe: Recipe, 
  onInspect: () => void, 
  onLog: (e: React.MouseEvent) => void,
  isLogging: boolean,
  isLogged: boolean
}) {
  return (
    <div 
      onClick={onInspect}
      className="group relative p-4 bg-card rounded-3xl border border-card-border flex gap-4 items-center cursor-pointer active:scale-[0.98] transition-all hover:border-primary/30"
    >
      <RecipeVisual recipe={recipe} className="w-20 h-20 rounded-2xl flex items-center justify-center shrink-0 shadow-inner" fallback={<BookOpen className="text-white/40 w-8 h-8 relative z-10" strokeWidth={1.5} />} />
      <div className="flex-1 min-w-0 py-1">
        <h3 className="font-display font-bold text-foreground truncate text-lg group-hover:text-primary transition-colors">{recipe.name}</h3>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{recipe.mealType}</span>
          <span className="w-1 h-1 rounded-full bg-border" />
          <span className="text-sm font-medium text-foreground/80">{Math.round(recipe.calories)} kcal</span>
        </div>
        <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground font-medium">
          <span>{Math.round(recipe.protein)}g P</span>
          <span>{Math.round(recipe.carbs)}g C</span>
          <span>{Math.round(recipe.fat)}g F</span>
        </div>
      </div>
      <button 
        onClick={onLog}
        disabled={isLogging || isLogged}
        className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-colors ${
          isLogged 
            ? 'bg-accent text-accent-foreground' 
            : isLogging
            ? 'bg-primary/20 text-primary'
            : 'bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground'
        }`}
      >
        {isLogged ? <Check strokeWidth={3} size={20} /> : isLogging ? <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Plus strokeWidth={2.5} size={22} />}
      </button>
    </div>
  );
}

function FeaturedRecipeCard({ 
  recipe, 
  onInspect, 
  onLog,
  isLogging,
  isLogged
}: { 
  recipe: Recipe, 
  onInspect: () => void, 
  onLog: (e: React.MouseEvent) => void,
  isLogging: boolean,
  isLogged: boolean
}) {
  return (
    <div 
      onClick={onInspect}
      className="group relative w-64 p-5 bg-card rounded-[2rem] border border-card-border flex flex-col cursor-pointer active:scale-[0.98] transition-all shrink-0 hover:border-primary/30"
    >
      <RecipeVisual recipe={recipe} className="w-full h-32 rounded-2xl mb-4 flex items-start justify-between p-3">
        <span className="bg-background/40 backdrop-blur-md px-3 py-1 rounded-lg text-xs font-bold text-white z-10">
          {Math.round(recipe.calories)} kcal
        </span>
      </RecipeVisual>
      <h3 className="font-display font-bold text-lg text-foreground leading-tight line-clamp-2 group-hover:text-primary transition-colors">{recipe.name}</h3>
      <div className="flex items-center gap-2 mt-2">
         <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{recipe.mealType}</span>
         <span className="w-1 h-1 rounded-full bg-border" />
         <span className="text-xs font-medium text-muted-foreground">{Math.round(recipe.protein)}g Protein</span>
      </div>
      
      <button 
        onClick={onLog}
        disabled={isLogging || isLogged}
        className={`absolute top-6 right-6 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all z-10 ${
          isLogged 
            ? 'bg-accent text-accent-foreground scale-110' 
            : isLogging
            ? 'bg-background/80 backdrop-blur-md text-foreground'
            : 'bg-background/80 backdrop-blur-md text-foreground hover:bg-primary hover:text-primary-foreground'
        }`}
      >
        {isLogged ? <Check strokeWidth={3} size={18} /> : isLogging ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Plus strokeWidth={2.5} size={20} />}
      </button>
    </div>
  );
}

export default function Recipes() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(getLocalDay);
  const timeZone = useMemo(() => getDeviceTimeZone(), []);
  const weekStart = useMemo(() => getLocalWeekStart(date), [date]);
  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const value = shiftLocalDay(weekStart, index);
        return {
          date: value,
          label: new Intl.DateTimeFormat("en-AU", { weekday: "short" }).format(new Date(`${value}T00:00:00`)),
          day: new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" }).format(new Date(`${value}T00:00:00`)),
        };
      }),
    [weekStart],
  );

  const [activeView, setActiveView] = useState<RecipeView>("library");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [mealType, setMealType] = useState<MealTypeFilter | undefined>();
  
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [loggingId, setLoggingId] = useState<string | null>(null);
  const [loggedId, setLoggedId] = useState<string | null>(null);
  const [isModalLogging, setIsModalLogging] = useState(false);
  const [modalLogged, setModalLogged] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const refreshDay = () => setDate((currentDate) => {
      const nextDate = getLocalDay();
      return nextDate === currentDate ? currentDate : nextDate;
    });
    const interval = window.setInterval(refreshDay, 60_000);
    window.addEventListener("visibilitychange", refreshDay);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("visibilitychange", refreshDay);
    };
  }, []);

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: getGetRecipeRecommendationsQueryKey({ timeZone }) });
  }, [date, queryClient, timeZone]);

  const { data: recommendations, isLoading: isRecsLoading } = useGetRecipeRecommendations(
    { timeZone },
    { query: { queryKey: getGetRecipeRecommendationsQueryKey({ timeZone }), enabled: activeView === "library" && !debouncedSearch && !mealType } }
  );

  const { data: recipes, isLoading: isRecipesLoading, isError: isRecipesError } = useListRecipes(
    { search: debouncedSearch || undefined, mealType: mealType as any }
  );
  const { data: planRecipes } = useListRecipes(
    undefined,
    { query: { queryKey: getListRecipesQueryKey(), enabled: activeView === "plan" } },
  );

  const createMeal = useCreateMeal();
  const { data: mealPlan, isLoading: isPlanLoading, isError: isPlanError } = useGetMealPlan(
    { weekStart },
    { query: { queryKey: getGetMealPlanQueryKey({ weekStart }), enabled: activeView === "plan" } },
  );
  const { data: groceryList, isLoading: isGroceryLoading, isError: isGroceryError } = useGetGroceryList(
    { weekStart },
    { query: { queryKey: getGetGroceryListQueryKey({ weekStart }), enabled: activeView === "groceries" } },
  );
  const savePlanSlot = useSaveMealPlanSlot();
  const deletePlanSlot = useDeleteMealPlanSlot();
  const saveGroceryCheck = useSaveGroceryItemCheck();

  const handleQuickLog = (e: React.MouseEvent, recipe: Recipe) => {
    e.stopPropagation();
    if (loggingId || loggedId) return;
    
    setLoggingId(recipe.id);
    createMeal.mutate({
      data: {
        name: recipe.name,
        mealType: recipe.mealType,
        calories: recipe.calories,
        protein: recipe.protein,
        carbs: recipe.carbs,
        fat: recipe.fat
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMealsQueryKey({ date, timeZone }) });
        queryClient.invalidateQueries({ queryKey: getGetProgressQueryKey({ timeZone }) });
        queryClient.invalidateQueries({ queryKey: getGetRecipeRecommendationsQueryKey({ timeZone }) });
        setLoggingId(null);
        setLoggedId(recipe.id);
        setTimeout(() => setLoggedId(null), 2000);
      },
      onError: () => setLoggingId(null)
    });
  };

  const handleLogFromModal = (recipe: Recipe) => {
    if (isModalLogging || modalLogged) return;
    
    setIsModalLogging(true);
    createMeal.mutate({
      data: {
        name: recipe.name,
        mealType: recipe.mealType,
        calories: recipe.calories,
        protein: recipe.protein,
        carbs: recipe.carbs,
        fat: recipe.fat
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMealsQueryKey({ date, timeZone }) });
        queryClient.invalidateQueries({ queryKey: getGetProgressQueryKey({ timeZone }) });
        queryClient.invalidateQueries({ queryKey: getGetRecipeRecommendationsQueryKey({ timeZone }) });
        setIsModalLogging(false);
        setModalLogged(true);
        setTimeout(() => {
          setModalLogged(false);
          setSelectedRecipe(null);
        }, 1200);
      },
      onError: () => setIsModalLogging(false)
    });
  };

  useEffect(() => {
    if (selectedRecipe) {
      setModalLogged(false);
      setIsModalLogging(false);
    }
  }, [selectedRecipe]);

  const recipeForPlanSlot = (slotDate: string, slotName: typeof PLAN_SLOTS[number]) =>
    mealPlan?.slots.find((item) => item.date === slotDate && item.slot === slotName)?.recipe;

  const refreshPlan = () => {
    queryClient.invalidateQueries({ queryKey: getGetMealPlanQueryKey({ weekStart }) });
    queryClient.invalidateQueries({ queryKey: getGetGroceryListQueryKey({ weekStart }) });
  };

  const handlePlanChange = (slotDate: string, slotName: typeof PLAN_SLOTS[number], recipeId: string) => {
    setPlanError(null);
    if (!recipeId) {
      deletePlanSlot.mutate(
        { date: slotDate, slot: slotName },
        { onSuccess: refreshPlan, onError: () => setPlanError("We couldn't remove that meal. Please try again.") },
      );
      return;
    }
    savePlanSlot.mutate(
      { date: slotDate, slot: slotName, data: { recipeId } },
      { onSuccess: refreshPlan, onError: () => setPlanError("We couldn't save that meal. Please try again.") },
    );
  };

  const handleGroceryCheck = (ingredientKey: string, checked: boolean) => {
    saveGroceryCheck.mutate(
      { data: { weekStart, ingredientKey, checked } },
      {
        onSuccess: (updatedList) => {
          queryClient.setQueryData(getGetGroceryListQueryKey({ weekStart }), updatedList);
        },
      },
    );
  };

  return (
    <MobileLayout>
      <div className="flex-1 min-h-0 overflow-y-auto pb-40 hide-scrollbar">
        <header className="pt-8 pb-2 px-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary mb-1">Inspiration</p>
          <h1 className="text-3xl leading-none font-display font-bold text-foreground">Recipes</h1>
        </header>

        <div className="px-5 pt-5 pb-2">
          <div className="grid grid-cols-3 rounded-2xl border border-card-border bg-card p-1">
            {[
              { id: "library" as const, label: "Browse", icon: BookOpen },
              { id: "plan" as const, label: "Plan", icon: CalendarDays },
              { id: "groceries" as const, label: "Shop", icon: ShoppingBasket },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveView(item.id)}
                  className={`flex h-11 items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition-colors ${
                    activeView === item.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon size={15} /> {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {activeView === "library" && <>
        <div className="sticky top-0 z-20 bg-background/90 backdrop-blur-md pt-4 pb-4 px-5 mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
            <input 
              type="text" 
              placeholder="Search recipes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-12 bg-input rounded-2xl pl-11 pr-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary border-none transition-shadow"
            />
          </div>
          <div className="flex gap-2 mt-4 overflow-x-auto hide-scrollbar pb-1">
            {MEAL_TYPES.map((type) => (
              <button 
                key={type}
                onClick={() => setMealType(mealType === type ? undefined : type)}
                className={`px-4 py-2.5 rounded-xl text-sm font-bold capitalize whitespace-nowrap transition-colors ${
                  mealType === type 
                    ? 'bg-primary text-primary-foreground shadow-[0_4px_14px_rgba(255,107,53,0.25)]' 
                    : 'bg-card text-muted-foreground border border-card-border hover:text-foreground'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Recommendations block */}
        {isRecsLoading && !debouncedSearch && !mealType && (
          <div className="mb-8 px-5">
            <div className="h-4 w-32 bg-secondary rounded-full mb-3 animate-pulse" />
            <div className="h-8 w-48 bg-secondary rounded-xl mb-4 animate-pulse" />
            <div className="flex gap-4 overflow-hidden">
              <div className="w-64 h-[240px] bg-card border border-card-border rounded-[2rem] shrink-0 animate-pulse" />
              <div className="w-64 h-[240px] bg-card border border-card-border rounded-[2rem] shrink-0 animate-pulse" />
            </div>
          </div>
        )}

        {recommendations && recommendations.recipes.length > 0 && !debouncedSearch && !mealType && (
          <div className="mb-10">
            <div className="px-5 mb-4">
              <h2 className="text-[10px] font-bold text-accent uppercase tracking-[0.18em] flex items-center gap-1.5 mb-1">
                <Sparkles size={12} /> Smart Picks
              </h2>
              <p className="text-xl font-display font-bold text-foreground leading-tight pr-4">{recommendations.message}</p>
            </div>
            <motion.div 
              className="flex overflow-x-auto hide-scrollbar px-5 gap-4 pb-4"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4 }}
            >
              {recommendations.recipes.map((recipe) => (
                <FeaturedRecipeCard 
                  key={recipe.id} 
                  recipe={recipe} 
                  onInspect={() => setSelectedRecipe(recipe)} 
                  onLog={(e) => handleQuickLog(e, recipe)}
                  isLogging={loggingId === recipe.id}
                  isLogged={loggedId === recipe.id}
                />
              ))}
            </motion.div>
          </div>
        )}

        {/* Main List */}
        <div className="px-5 mb-4">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-[0.18em] mb-4">
            {debouncedSearch || mealType ? "Results" : "All Recipes"}
          </h2>
          
          {isRecipesLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-[114px] w-full bg-card border border-card-border rounded-3xl animate-pulse" />
              ))}
            </div>
          ) : isRecipesError ? (
            <div className="py-12 flex flex-col items-center text-center">
              <h3 className="font-display font-bold text-lg text-destructive">Something went wrong</h3>
              <p className="text-sm text-muted-foreground mt-2">We couldn't load the recipes. Please try again.</p>
            </div>
          ) : recipes?.length === 0 ? (
            <div className="py-12 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-3xl bg-card border border-card-border flex items-center justify-center text-muted-foreground mb-4">
                <Search size={28} />
              </div>
              <h3 className="font-display font-bold text-lg text-foreground">No recipes found</h3>
              <p className="text-sm text-muted-foreground mt-2">Try a different search term or filter.</p>
            </div>
          ) : (
            <motion.div 
              className="space-y-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <AnimatePresence>
                {recipes?.map((recipe, index) => (
                  <motion.div
                    key={recipe.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <RecipeCard 
                      recipe={recipe} 
                      onInspect={() => setSelectedRecipe(recipe)}
                      onLog={(e) => handleQuickLog(e, recipe)}
                      isLogging={loggingId === recipe.id}
                      isLogged={loggedId === recipe.id}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
        </>}

        {activeView === "plan" && (
          <section className="px-5 pb-4">
            <div className="mb-5 rounded-3xl border border-primary/20 bg-primary/10 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Weekly meal plan</p>
              <h2 className="mt-1 font-display text-2xl font-bold text-foreground">A simpler week starts here</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Choose a breakfast, lunch, and dinner from your saved recipe library for each day.</p>
            </div>
            {planError && <p className="mb-4 rounded-2xl bg-destructive/10 p-3 text-sm font-medium text-destructive">{planError}</p>}
            {isPlanLoading ? (
              <div className="space-y-4 animate-pulse">{[1, 2, 3].map((item) => <div key={item} className="h-48 rounded-3xl border border-card-border bg-card" />)}</div>
            ) : isPlanError ? (
              <div className="rounded-3xl border border-destructive/30 bg-destructive/10 p-6 text-center text-sm text-destructive">We couldn't load your weekly plan. Please try again.</div>
            ) : (
              <div className="space-y-4">
                {weekDays.map((day) => (
                  <div key={day.date} className="rounded-3xl border border-card-border bg-card p-4">
                    <div className="mb-3 flex items-baseline justify-between">
                      <h3 className="font-display text-lg font-bold text-foreground">{day.label}</h3>
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{day.day}</span>
                    </div>
                    <div className="space-y-2.5">
                      {PLAN_SLOTS.map((slotName) => {
                        const chosen = recipeForPlanSlot(day.date, slotName);
                        const isSaving = savePlanSlot.isPending || deletePlanSlot.isPending;
                        return (
                          <label key={slotName} className="flex items-center gap-3 rounded-2xl bg-background px-3 py-2.5">
                            <span className="w-16 text-[10px] font-bold uppercase tracking-[0.12em] text-primary">{slotName}</span>
                            <select
                              aria-label={`${day.label} ${slotName}`}
                              value={chosen?.id ?? ""}
                              disabled={isSaving}
                              onChange={(event) => handlePlanChange(day.date, slotName, event.target.value)}
                              className="min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground outline-none disabled:opacity-60"
                            >
                              <option value="" className="bg-card">Add a recipe</option>
                              {(planRecipes ?? recipes ?? []).map((recipe) => <option key={recipe.id} value={recipe.id} className="bg-card">{recipe.name}</option>)}
                            </select>
                            {chosen && (
                              <button
                                type="button"
                                aria-label={`Remove ${chosen.name} from ${day.label} ${slotName}`}
                                disabled={isSaving}
                                onClick={() => handlePlanChange(day.date, slotName, "")}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              >
                                <X size={15} />
                              </button>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeView === "groceries" && (
          <section className="px-5 pb-4">
            <div className="mb-5 rounded-3xl border border-accent/25 bg-accent/10 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Weekly grocery list</p>
              <h2 className="mt-1 font-display text-2xl font-bold text-foreground">One list, less thinking</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Your planned recipe ingredients are grouped here. Tap an item when it goes in the trolley.</p>
            </div>
            {isGroceryLoading ? (
              <div className="space-y-4 animate-pulse">{[1, 2, 3].map((item) => <div key={item} className="h-32 rounded-3xl border border-card-border bg-card" />)}</div>
            ) : isGroceryError ? (
              <div className="rounded-3xl border border-destructive/30 bg-destructive/10 p-6 text-center text-sm text-destructive">We couldn't build your grocery list. Please try again.</div>
            ) : groceryList?.groups.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-card-border bg-card px-6 py-12 text-center">
                <ShoppingBasket className="mx-auto mb-3 text-primary" size={30} />
                <h3 className="font-display text-xl font-bold text-foreground">Your trolley is empty</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Add recipes to your weekly plan and we’ll combine the ingredients here.</p>
                <button onClick={() => setActiveView("plan")} className="mt-5 text-sm font-bold text-primary">Build this week’s plan</button>
              </div>
            ) : (
              <div className="space-y-5">
                {groceryList?.groups.map((group) => (
                  <div key={group.group} className="rounded-3xl border border-card-border bg-card p-4">
                    <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-primary">{group.group}</h3>
                    <div className="space-y-2">
                      {group.items.map((item) => (
                        <button
                          key={item.key}
                          aria-pressed={item.checked}
                          disabled={saveGroceryCheck.isPending}
                          onClick={() => handleGroceryCheck(item.key, !item.checked)}
                          className="flex w-full items-center gap-3 rounded-2xl bg-background px-3 py-3 text-left disabled:opacity-60"
                        >
                          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${item.checked ? "border-accent bg-accent text-accent-foreground" : "border-card-border text-transparent"}`}>
                            <Check size={15} strokeWidth={3} />
                          </span>
                          <span className={`flex-1 text-sm font-medium ${item.checked ? "text-muted-foreground line-through" : "text-foreground"}`}>{item.name}</span>
                          <span className="text-xs font-bold text-muted-foreground">{item.quantity}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
      
      <BottomNav />

      {/* Detail Modal */}
      <Drawer.Root open={!!selectedRecipe} onOpenChange={(open) => !open && setSelectedRecipe(null)}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50" />
          <Drawer.Content className="bg-card flex flex-col rounded-t-[2rem] h-[85dvh] fixed bottom-0 left-0 right-0 z-50 border-t border-card-border outline-none">
            <div className="p-4 bg-card rounded-t-[2rem] shrink-0 flex justify-center pb-2">
              <div className="w-12 h-1.5 bg-card-border rounded-full" />
            </div>
            
            {selectedRecipe && (
              <>
                <Drawer.Title className="sr-only">{selectedRecipe.name}</Drawer.Title>
                <Drawer.Description className="sr-only">Details and instructions for {selectedRecipe.name}</Drawer.Description>
                
                <div className="flex-1 overflow-y-auto px-5 pb-[120px] hide-scrollbar">
                   <RecipeVisual recipe={selectedRecipe} className="w-full h-48 rounded-[2rem] mb-6 flex flex-col justify-end p-5">
                      {(hasImage) => (
                        <>
                      {hasImage && <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />}
                     <div className="relative z-10">
                       <span className="w-fit bg-background/40 backdrop-blur-md px-3 py-1.5 rounded-xl text-[10px] font-bold text-white uppercase tracking-widest mb-3 inline-block">
                         {selectedRecipe.mealType}
                       </span>
                       <h2 className="font-display font-bold text-3xl text-white leading-tight drop-shadow-md">
                         {selectedRecipe.name}
                       </h2>
                      </div>
                        </>
                      )}
                   </RecipeVisual>

                  <div className="grid grid-cols-4 gap-3 mb-8">
                    <div className="bg-background rounded-2xl p-3 flex flex-col items-center justify-center text-center border border-card-border">
                      <span className="text-lg font-display font-bold text-primary">{Math.round(selectedRecipe.calories)}</span>
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Kcal</span>
                    </div>
                    <div className="bg-background rounded-2xl p-3 flex flex-col items-center justify-center text-center border border-card-border">
                      <span className="text-lg font-display font-bold text-foreground">{Math.round(selectedRecipe.protein)}g</span>
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Protein</span>
                    </div>
                    <div className="bg-background rounded-2xl p-3 flex flex-col items-center justify-center text-center border border-card-border">
                      <span className="text-lg font-display font-bold text-foreground">{Math.round(selectedRecipe.carbs)}g</span>
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Carbs</span>
                    </div>
                    <div className="bg-background rounded-2xl p-3 flex flex-col items-center justify-center text-center border border-card-border">
                      <span className="text-lg font-display font-bold text-foreground">{Math.round(selectedRecipe.fat)}g</span>
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Fat</span>
                    </div>
                  </div>

                  <div className="mb-8">
                    <h3 className="font-display font-bold text-xl text-foreground mb-4 flex items-center gap-2">
                      <Utensils size={20} className="text-primary" /> Ingredients
                    </h3>
                    <ul className="space-y-3">
                      {selectedRecipe.ingredients.map((ing, i) => (
                        <li key={i} className="flex justify-between items-center py-2 border-b border-card-border last:border-0">
                          <span className="text-foreground capitalize">{ing.name}</span>
                          <span className="text-muted-foreground font-medium text-sm">{ing.amount} {ing.unit}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mb-4">
                    <h3 className="font-display font-bold text-xl text-foreground mb-4 flex items-center gap-2">
                      <ChefHat size={20} className="text-primary" /> Instructions
                    </h3>
                    <ol className="space-y-5">
                      {selectedRecipe.steps.map((step, i) => (
                        <li key={i} className="flex gap-4">
                          <span className="shrink-0 w-8 h-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-bold text-sm">
                            {i + 1}
                          </span>
                          <span className="text-foreground leading-relaxed pt-1 text-sm">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>

                <div className="absolute bottom-0 inset-x-0 p-5 bg-gradient-to-t from-card via-card to-transparent pt-12 pb-8">
                  <button 
                    onClick={() => handleLogFromModal(selectedRecipe)}
                    disabled={isModalLogging || modalLogged}
                    className={`w-full h-14 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 transition-all ${
                      modalLogged 
                        ? 'bg-accent text-accent-foreground shadow-[0_8px_30px_rgba(0,214,143,0.3)]' 
                        : 'bg-primary text-primary-foreground shadow-[0_8px_30px_rgba(255,107,53,0.3)] active:scale-[0.98]'
                    }`}
                  >
                    {modalLogged ? (
                      <><Check strokeWidth={3} /> Logged successfully</>
                    ) : isModalLogging ? (
                      <div className="w-6 h-6 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    ) : (
                      <><Plus strokeWidth={2.5} /> Log as {selectedRecipe.mealType}</>
                    )}
                  </button>
                </div>
              </>
            )}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </MobileLayout>
  );
}
