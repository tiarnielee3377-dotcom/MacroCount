import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Camera as NativeCamera, CameraResultType, CameraSource } from "@capacitor/camera";
import {
  getListMealsQueryKey,
  getProgress,
  getGetProgressQueryKey,
  useAnalyzeMeal,
  useCreateMeal,
  useGetProgress,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { MobileLayout } from "@/components/layout";
import { 
  ArrowLeft, Camera,
  Loader2, Check, Sparkles, X, ChevronRight, Scale,
  Flame
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getDeviceTimeZone, getLocalDay } from "@/lib/day";

type MealEstimate = {
  name: string;
  mealType: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number;
  notes: string;
};

export default function LogMeal() {
  const [, setLocation] = useLocation();
  const [description, setDescription] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<MealEstimate | null>(null);
  const [portionScale, setPortionScale] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const analyzeMeal = useAnalyzeMeal();
  const createMeal = useCreateMeal();
  const queryClient = useQueryClient();
  const timeZone = getDeviceTimeZone();
  const date = getLocalDay();
  const { data: progress } = useGetProgress({ timeZone }, {
    query: { queryKey: getGetProgressQueryKey({ timeZone }), retry: false },
  });

  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback;

  const handleCapture = async () => {
    if (isCapturing) return;

    setErrorMessage(null);
    setIsCapturing(true);
    try {
      const photo = await NativeCamera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        correctOrientation: true,
      });

      if (!photo.dataUrl) {
        throw new Error("The camera did not return an image.");
      }
      setImagePreview(photo.dataUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (!message.includes("cancel")) {
        setErrorMessage("We couldn't open the camera. Check camera permission and try again.");
      }
    } finally {
      setIsCapturing(false);
    }
  };

  const handleAnalyze = () => {
    if (!description && !imagePreview) return;
    setErrorMessage(null);
    
    analyzeMeal.mutate({
      data: {
        description: description || null,
        imageData: imagePreview || null,
      }
    }, {
      onSuccess: (data) => {
        setEstimate(data);
        setPortionScale(1);
      },
      onError: (error) => {
        setErrorMessage(
          getErrorMessage(
            error,
            "We couldn't analyze that meal. Try a clearer photo or add a short description.",
          ),
        );
      },
    });
  };

  const handleConfirm = async () => {
    if (!estimate) return;
    setErrorMessage(null);
    let beforeProgress: typeof progress;
    try {
      beforeProgress = await getProgress({ timeZone });
    } catch {
      beforeProgress = undefined;
    }

    createMeal.mutate({
      data: {
        name: estimate.name,
        mealType: estimate.mealType,
        calories: Math.round(estimate.calories * portionScale),
        protein: Math.round(estimate.protein * portionScale),
        carbs: Math.round(estimate.carbs * portionScale),
        fat: Math.round(estimate.fat * portionScale),
      }
    }, {
      onSuccess: async () => {
        try {
          const afterProgress = await getProgress({ timeZone });
          queryClient.setQueryData(getGetProgressQueryKey({ timeZone }), afterProgress);
          if (beforeProgress) {
            window.sessionStorage.setItem(
              "macrosnap:progress-handoff",
              JSON.stringify({ before: beforeProgress, after: afterProgress, timeZone }),
            );
          }
        } catch {
          // A saved meal should not be blocked if the optional progress refresh fails.
        }
        await queryClient.refetchQueries({
          queryKey: getListMealsQueryKey({ date, timeZone }),
          type: "all",
        });
        queryClient.invalidateQueries({ queryKey: getGetProgressQueryKey({ timeZone }) });
        setLocation("/dashboard");
      },
      onError: (error) => {
        setErrorMessage(
          getErrorMessage(
            error,
            "We couldn't save this meal. Please try again—your estimate is still here.",
          ),
        );
      },
    });
  };

  return (
    <MobileLayout>
      <div className="flex flex-col min-h-0 h-full bg-background">
        {/* Header */}
        <header className="h-16 flex items-center px-5 shrink-0 border-b border-card-border bg-background/90 backdrop-blur-md sticky top-0 z-10">
          <button 
            onClick={() => setLocation("/dashboard")}
            className="w-10 h-10 flex items-center justify-center rounded-2xl bg-secondary text-foreground active:scale-95 transition-transform"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-display font-bold text-foreground ml-4">
            {estimate ? "Review Estimate" : "Log a Meal"}
          </h1>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto hide-scrollbar pb-8">
          {errorMessage && (
            <div
              role="alert"
              className="mx-6 mt-4 rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {errorMessage}
            </div>
          )}
          <AnimatePresence mode="wait">
            {!estimate ? (
              <motion.div 
                key="input-step"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -20 }}
                className="p-6 flex flex-col gap-6"
              >
                {/* Image Upload Area */}
                <div 
                  onClick={() => {
                    if (!imagePreview) void handleCapture();
                  }}
                  onKeyDown={(event) => {
                    if (!imagePreview && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      void handleCapture();
                    }
                  }}
                  role="button"
                  tabIndex={imagePreview ? -1 : 0}
                  className={cn(
                    "w-full aspect-square rounded-[2rem] border-2 border-dashed flex flex-col items-center justify-center overflow-hidden relative transition-all active:scale-[0.98]",
                    imagePreview 
                      ? "border-transparent bg-background" 
                      : "border-primary/40 bg-primary/10 text-primary cursor-pointer hover:bg-primary/15",
                    isCapturing && "opacity-70 pointer-events-none",
                  )}
                >
                  {imagePreview ? (
                    <>
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover opacity-90" />
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setImagePreview(null);
                        }}
                        className="absolute top-4 right-4 w-10 h-10 bg-background/80 backdrop-blur-md rounded-2xl text-foreground flex items-center justify-center"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="w-16 h-16 bg-card rounded-2xl flex items-center justify-center border border-card-border mb-4">
                        <Camera className="w-7 h-7 text-primary" />
                      </div>
                      <span className="font-medium text-lg">{isCapturing ? "Opening camera..." : "Snap your meal"}</span>
                      <span className="text-sm opacity-70 mt-1">Tap to take a photo</span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <div className="h-px bg-border flex-1" />
                  <span className="text-xs font-medium text-muted-foreground uppercase">OR DESCRIBE IT</span>
                  <div className="h-px bg-border flex-1" />
                </div>

                {/* Text input */}
                <div className="relative">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. A bowl of oatmeal with blueberries and a spoonful of peanut butter..."
                    className="w-full h-32 rounded-3xl bg-card border border-card-border focus:border-primary/60 focus:bg-card p-5 resize-none outline-none transition-all placeholder:text-muted-foreground/60 text-foreground"
                  />
                  <div className="absolute bottom-3 right-3 opacity-30">
                    <Sparkles className="w-5 h-5 text-primary" />
                  </div>
                </div>

                {/* Analyze Button */}
                <button
                  onClick={handleAnalyze}
                  disabled={(!description && !imagePreview) || analyzeMeal.isPending}
                  className="h-16 w-full mt-2 bg-primary text-primary-foreground rounded-2xl font-bold text-lg flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-all"
                >
                  {analyzeMeal.isPending ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      Let's see the numbers <ChevronRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="estimate-step"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-6 flex flex-col gap-6"
              >
                {/* Result Hero */}
                <div className="text-center py-6">
                  <div className="w-16 h-16 bg-primary/15 text-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="w-8 h-8" />
                  </div>
                  <h2 className="text-4xl leading-none font-display font-bold text-foreground mb-3">{estimate.name}</h2>
                  <p className="text-muted-foreground bg-secondary inline-block px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider">
                    {estimate.mealType.charAt(0).toUpperCase() + estimate.mealType.slice(1)}
                  </p>
                </div>

                {/* Macros Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-primary text-primary-foreground p-5 rounded-3xl col-span-2 flex justify-between items-center">
                    <div>
                      <span className="block text-primary-foreground/80 font-medium text-sm mb-1 uppercase tracking-wider">Calories</span>
                      <span className="text-5xl font-display font-bold">{Math.round(estimate.calories * portionScale)}</span>
                    </div>
                    <Flame className="w-10 h-10 opacity-20" />
                  </div>
                  
                  <div className="bg-accent/10 border border-accent/20 p-4 rounded-3xl">
                    <span className="block text-accent font-medium text-xs mb-1 uppercase tracking-wider">Protein</span>
                    <span className="text-2xl font-bold text-foreground">{Math.round(estimate.protein * portionScale)}<span className="text-base font-normal text-muted-foreground">g</span></span>
                  </div>
                  <div className="bg-[#FFB020]/10 border border-[#FFB020]/20 p-4 rounded-3xl">
                    <span className="block text-[#FFB020] font-bold text-xs mb-1 uppercase tracking-wider">Carbs</span>
                    <span className="text-2xl font-bold text-foreground">{Math.round(estimate.carbs * portionScale)}<span className="text-base font-normal text-muted-foreground">g</span></span>
                  </div>
                  <div className="bg-primary/10 border border-primary/20 p-4 rounded-3xl col-span-2 flex justify-between items-center">
                    <div>
                      <span className="block text-primary font-bold text-xs mb-1 uppercase tracking-wider">Fat</span>
                      <span className="text-2xl font-bold text-foreground">{Math.round(estimate.fat * portionScale)}<span className="text-base font-normal text-muted-foreground">g</span></span>
                    </div>
                  </div>
                </div>

                {/* Portion Adjuster */}
                  <div className="bg-card rounded-3xl p-5 border border-card-border">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-medium text-foreground flex items-center gap-2">
                      <Scale className="w-4 h-4 text-muted-foreground" /> Portion Size
                    </h3>
                    <span className="text-sm font-bold bg-secondary px-2.5 py-1 rounded-lg">
                      {Math.round(portionScale * 100)}%
                    </span>
                  </div>
                  <input 
                    type="range" 
                    min="0.25" 
                    max="2" 
                    step="0.25" 
                    value={portionScale}
                    onChange={(e) => setPortionScale(Number(e.target.value))}
                    className="w-full h-2 bg-border rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-2 font-medium">
                    <span>Small (25%)</span>
                    <span>Standard</span>
                    <span>Large (200%)</span>
                  </div>
                </div>

                {/* AI Notes */}
                {estimate.notes && (
                  <div className="bg-[#FFB020]/10 p-4 rounded-2xl border border-[#FFB020]/25 text-sm text-[#FFB020]">
                    <span className="font-bold block mb-1">AI note:</span>
                    {estimate.notes}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => setEstimate(null)}
                    className="h-16 w-16 shrink-0 rounded-2xl border border-card-border bg-card text-muted-foreground flex items-center justify-center active:scale-95 transition-transform"
                  >
                    <ArrowLeft className="w-6 h-6" />
                  </button>
                  <button
                    onClick={handleConfirm}
                    disabled={createMeal.isPending}
                    className="h-16 flex-1 bg-accent text-accent-foreground rounded-2xl font-bold text-lg flex items-center justify-center gap-2 disabled:opacity-70 active:scale-[0.98] transition-all"
                  >
                    {createMeal.isPending ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      <>Log it <Check className="w-5 h-5" /></>
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
