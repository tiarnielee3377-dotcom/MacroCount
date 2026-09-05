export type WorkoutExercise = {
  id: string;
  name: string;
  mode: "reps" | "duration";
  reps?: number;
  durationSeconds?: number;
  instruction: string;
};

export type WorkoutRoutine = {
  id: string;
  category: "full-body" | "upper-body" | "lower-body" | "core";
  name: string;
  description: string;
  estimatedMinutes: number;
  caloriesPerMinute: number;
  exercises: WorkoutExercise[];
};

const reps = (id: string, name: string, count: number, instruction: string): WorkoutExercise => ({
  id, name, mode: "reps", reps: count, instruction,
});
const duration = (id: string, name: string, seconds: number, instruction: string): WorkoutExercise => ({
  id, name, mode: "duration", durationSeconds: seconds, instruction,
});

export const starterWorkouts: WorkoutRoutine[] = [
  {
    id: "full-body-foundation", category: "full-body", name: "Full Body Foundation",
    description: "A friendly, no-equipment circuit to wake up every major muscle group.",
    estimatedMinutes: 8, caloriesPerMinute: 7,
    exercises: [
      reps("squats", "Bodyweight squats", 12, "Sit your hips back, keep your chest lifted, then drive through your feet."),
      duration("march", "March in place", 30, "Stand tall and alternate lifting your knees at a comfortable pace."),
      reps("push-ups", "Push-ups", 8, "Keep your body in one long line; lower with control and press the floor away."),
      duration("plank", "Forearm plank", 25, "Brace your core and keep your hips level with your shoulders."),
      reps("reverse-lunges", "Reverse lunges", 10, "Step one foot back, lower softly, then press through the front heel."),
    ],
  },
  {
    id: "upper-body-basics", category: "upper-body", name: "Upper Body Basics",
    description: "Build steady strength through your shoulders, arms, chest, and back.",
    estimatedMinutes: 8, caloriesPerMinute: 6,
    exercises: [
      reps("incline-push-ups", "Incline push-ups", 10, "Use a sturdy counter or wall and keep elbows angled gently back."),
      duration("arm-circles", "Arm circles", 30, "Make smooth circles, then reverse direction halfway through."),
      reps("tricep-dips", "Chair tricep dips", 8, "Use a stable chair, keep shoulders down, and bend elbows straight back."),
      duration("bear-hold", "Bear hold", 25, "Hover knees just above the floor while keeping your back flat."),
      reps("superman", "Superman lifts", 10, "Lift opposite arm and leg slowly, pause, and switch sides."),
    ],
  },
  {
    id: "lower-body-burn", category: "lower-body", name: "Lower Body Burn",
    description: "A simple leg-focused routine for glutes, quads, and steady balance.",
    estimatedMinutes: 8, caloriesPerMinute: 7,
    exercises: [
      reps("wide-squats", "Wide-stance squats", 12, "Turn toes slightly out, lower between your knees, and stand tall."),
      reps("glute-bridges", "Glute bridges", 12, "Press through your heels and squeeze your glutes at the top."),
      duration("wall-sit", "Wall sit", 30, "Rest your back against a wall and hold a comfortable seated position."),
      reps("calf-raises", "Calf raises", 15, "Rise onto the balls of your feet, pause, then lower slowly."),
      reps("side-lunges", "Side lunges", 10, "Step wide, send hips back, and push off to return to center."),
    ],
  },
  {
    id: "core-reset", category: "core", name: "Core Reset",
    description: "A grounded core sequence focused on control, breathing, and posture.",
    estimatedMinutes: 7, caloriesPerMinute: 5,
    exercises: [
      duration("dead-bug", "Dead bug hold", 30, "Lie on your back, brace gently, and lower opposite limbs with control."),
      reps("bird-dog", "Bird-dog", 10, "From hands and knees, reach opposite arm and leg without twisting."),
      duration("side-plank", "Side plank", 20, "Stack your shoulder over your elbow and lift hips into a straight line."),
      reps("slow-mountain-climbers", "Slow mountain climbers", 12, "From a plank, bring one knee in at a time while keeping hips steady."),
      duration("hollow-hold", "Hollow hold", 20, "Keep your ribs tucked and hold the easiest shape that feels controlled."),
    ],
  },
];

export function workoutById(id: string) {
  return starterWorkouts.find((workout) => workout.id === id);
}