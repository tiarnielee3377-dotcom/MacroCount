export type RecipeMealType = "breakfast" | "lunch" | "dinner" | "snack";
export type GroceryGroup = "produce" | "protein" | "pantry";

export type RecipeIngredient = {
  name: string;
  amount: number;
  unit: string;
  group: GroceryGroup;
};

export type StarterRecipe = {
  id: string;
  name: string;
  mealType: RecipeMealType;
  imageLabel: string;
  ingredients: RecipeIngredient[];
  steps: string[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

const ingredient = (name: string, amount: number, unit: string, group: GroceryGroup): RecipeIngredient => ({
  name,
  amount,
  unit,
  group,
});

export const starterRecipes: StarterRecipe[] = [
  {
    id: "protein-berry-oats",
    name: "Protein Berry Overnight Oats",
    mealType: "breakfast",
    imageLabel: "Berry oats in a glass jar",
    ingredients: [ingredient("Rolled oats", 0.5, "cup", "pantry"), ingredient("Greek yogurt", 0.75, "cup", "protein"), ingredient("Milk", 0.5, "cup", "protein"), ingredient("Mixed berries", 0.75, "cup", "produce"), ingredient("Chia seeds", 1, "tbsp", "pantry")],
    steps: ["Stir oats, yogurt, milk, and chia in a jar.", "Refrigerate overnight.", "Top with berries before eating."],
    calories: 390, protein: 29, carbs: 51, fat: 9,
  },
  {
    id: "egg-spinach-wrap",
    name: "Egg & Spinach Wrap",
    mealType: "breakfast",
    imageLabel: "Folded egg wrap with greens",
    ingredients: [ingredient("Eggs", 2, "each", "protein"), ingredient("Baby spinach", 1, "cup", "produce"), ingredient("Wholegrain wrap", 1, "each", "pantry"), ingredient("Feta", 30, "g", "protein"), ingredient("Tomato", 1, "each", "produce")],
    steps: ["Scramble eggs with spinach.", "Warm the wrap.", "Fill with eggs, tomato, and crumbled feta."],
    calories: 410, protein: 27, carbs: 34, fat: 19,
  },
  {
    id: "peanut-banana-toast",
    name: "Peanut Butter Banana Toast",
    mealType: "breakfast",
    imageLabel: "Toast topped with banana slices",
    ingredients: [ingredient("Wholegrain bread", 2, "slices", "pantry"), ingredient("Peanut butter", 1, "tbsp", "pantry"), ingredient("Banana", 1, "each", "produce"), ingredient("Cinnamon", 0.5, "tsp", "pantry")],
    steps: ["Toast the bread.", "Spread peanut butter over each slice.", "Top with banana and cinnamon."],
    calories: 360, protein: 13, carbs: 54, fat: 12,
  },
  {
    id: "yogurt-crunch-bowl",
    name: "Greek Yogurt Crunch Bowl",
    mealType: "breakfast",
    imageLabel: "Creamy yogurt with granola",
    ingredients: [ingredient("Greek yogurt", 1, "cup", "protein"), ingredient("Granola", 0.25, "cup", "pantry"), ingredient("Strawberries", 0.5, "cup", "produce"), ingredient("Honey", 1, "tsp", "pantry"), ingredient("Almonds", 10, "g", "pantry")],
    steps: ["Spoon yogurt into a bowl.", "Add strawberries and granola.", "Finish with honey and almonds."],
    calories: 340, protein: 25, carbs: 39, fat: 10,
  },
  {
    id: "chicken-quinoa-bowl",
    name: "Chicken Quinoa Power Bowl",
    mealType: "lunch",
    imageLabel: "Chicken and quinoa grain bowl",
    ingredients: [ingredient("Chicken breast", 140, "g", "protein"), ingredient("Cooked quinoa", 0.75, "cup", "pantry"), ingredient("Baby spinach", 1, "cup", "produce"), ingredient("Cucumber", 0.5, "each", "produce"), ingredient("Cherry tomatoes", 0.5, "cup", "produce"), ingredient("Olive oil", 1, "tsp", "pantry")],
    steps: ["Cook chicken until golden and slice.", "Layer quinoa and vegetables in a bowl.", "Add chicken and drizzle with olive oil."],
    calories: 520, protein: 45, carbs: 45, fat: 17,
  },
  {
    id: "turkey-hummus-wrap",
    name: "Turkey Hummus Wrap",
    mealType: "lunch",
    imageLabel: "Turkey wrap cut in half",
    ingredients: [ingredient("Wholegrain wrap", 1, "each", "pantry"), ingredient("Turkey breast", 100, "g", "protein"), ingredient("Hummus", 2, "tbsp", "pantry"), ingredient("Lettuce", 1, "cup", "produce"), ingredient("Carrot", 1, "each", "produce"), ingredient("Cucumber", 0.5, "each", "produce")],
    steps: ["Spread hummus over the wrap.", "Layer turkey and sliced vegetables.", "Roll tightly and slice."],
    calories: 430, protein: 34, carbs: 43, fat: 14,
  },
  {
    id: "tuna-bean-salad",
    name: "Tuna & Bean Salad",
    mealType: "lunch",
    imageLabel: "Fresh tuna and bean salad",
    ingredients: [ingredient("Tuna", 95, "g", "protein"), ingredient("Cannellini beans", 0.5, "cup", "pantry"), ingredient("Mixed leaves", 2, "cups", "produce"), ingredient("Cherry tomatoes", 0.5, "cup", "produce"), ingredient("Lemon", 0.5, "each", "produce"), ingredient("Olive oil", 1, "tsp", "pantry")],
    steps: ["Drain tuna and beans.", "Toss with leaves and tomatoes.", "Dress with lemon juice and olive oil."],
    calories: 390, protein: 36, carbs: 30, fat: 14,
  },
  {
    id: "tofu-rice-bowl",
    name: "Tofu Veggie Rice Bowl",
    mealType: "lunch",
    imageLabel: "Crisp tofu and rice bowl",
    ingredients: [ingredient("Firm tofu", 150, "g", "protein"), ingredient("Cooked brown rice", 0.75, "cup", "pantry"), ingredient("Broccoli", 1, "cup", "produce"), ingredient("Carrot", 1, "each", "produce"), ingredient("Soy sauce", 1, "tbsp", "pantry"), ingredient("Sesame seeds", 1, "tsp", "pantry")],
    steps: ["Pan-sear tofu until crisp.", "Steam broccoli and carrot.", "Serve over rice with soy sauce and sesame."],
    calories: 480, protein: 27, carbs: 59, fat: 16,
  },
  {
    id: "lemon-chicken-traybake",
    name: "Lemon Chicken Tray Bake",
    mealType: "dinner",
    imageLabel: "Roasted chicken and vegetables",
    ingredients: [ingredient("Chicken breast", 170, "g", "protein"), ingredient("Baby potatoes", 200, "g", "produce"), ingredient("Zucchini", 1, "each", "produce"), ingredient("Capsicum", 1, "each", "produce"), ingredient("Lemon", 0.5, "each", "produce"), ingredient("Olive oil", 1, "tsp", "pantry")],
    steps: ["Chop vegetables and place on a tray.", "Add chicken, lemon, and olive oil.", "Roast at 200°C until cooked through."],
    calories: 510, protein: 49, carbs: 45, fat: 15,
  },
  {
    id: "turkey-taco-skillet",
    name: "Turkey Taco Skillet",
    mealType: "dinner",
    imageLabel: "Colourful turkey taco skillet",
    ingredients: [ingredient("Turkey mince", 150, "g", "protein"), ingredient("Black beans", 0.5, "cup", "pantry"), ingredient("Corn", 0.5, "cup", "pantry"), ingredient("Capsicum", 1, "each", "produce"), ingredient("Tomato", 1, "each", "produce"), ingredient("Taco seasoning", 1, "tbsp", "pantry")],
    steps: ["Brown turkey mince in a skillet.", "Add capsicum, beans, corn, and seasoning.", "Stir in tomato and cook until warm."],
    calories: 470, protein: 42, carbs: 44, fat: 14,
  },
  {
    id: "lentil-coconut-curry",
    name: "Lentil Coconut Curry",
    mealType: "dinner",
    imageLabel: "Golden lentil curry bowl",
    ingredients: [ingredient("Red lentils", 0.5, "cup", "pantry"), ingredient("Light coconut milk", 0.5, "cup", "pantry"), ingredient("Diced tomatoes", 0.5, "cup", "pantry"), ingredient("Baby spinach", 1, "cup", "produce"), ingredient("Curry powder", 1, "tsp", "pantry"), ingredient("Cooked brown rice", 0.5, "cup", "pantry")],
    steps: ["Simmer lentils with tomatoes, coconut milk, and curry powder.", "Stir in spinach to wilt.", "Serve over brown rice."],
    calories: 455, protein: 20, carbs: 67, fat: 13,
  },
  {
    id: "salmon-sweet-potato",
    name: "Salmon Sweet Potato Plate",
    mealType: "dinner",
    imageLabel: "Salmon with sweet potato and greens",
    ingredients: [ingredient("Salmon fillet", 140, "g", "protein"), ingredient("Sweet potato", 250, "g", "produce"), ingredient("Green beans", 1, "cup", "produce"), ingredient("Lemon", 0.5, "each", "produce"), ingredient("Olive oil", 1, "tsp", "pantry")],
    steps: ["Roast sweet potato until tender.", "Pan-sear salmon.", "Steam beans and serve with lemon."],
    calories: 550, protein: 37, carbs: 52, fat: 21,
  },
  {
    id: "cottage-cheese-apple",
    name: "Apple & Cottage Cheese Cup",
    mealType: "snack",
    imageLabel: "Apple slices beside cottage cheese",
    ingredients: [ingredient("Cottage cheese", 0.75, "cup", "protein"), ingredient("Apple", 1, "each", "produce"), ingredient("Cinnamon", 0.5, "tsp", "pantry"), ingredient("Walnuts", 10, "g", "pantry")],
    steps: ["Slice the apple.", "Spoon cottage cheese into a cup.", "Add cinnamon and walnuts."],
    calories: 280, protein: 22, carbs: 28, fat: 10,
  },
  {
    id: "edamame-crunch-cup",
    name: "Edamame Crunch Cup",
    mealType: "snack",
    imageLabel: "Edamame snack cup with sea salt",
    ingredients: [ingredient("Edamame", 1, "cup", "protein"), ingredient("Sea salt", 0.25, "tsp", "pantry"), ingredient("Chili flakes", 0.25, "tsp", "pantry"), ingredient("Lemon", 0.5, "each", "produce")],
    steps: ["Steam edamame until hot.", "Season with salt and chili.", "Finish with lemon juice."],
    calories: 210, protein: 18, carbs: 16, fat: 9,
  },
  {
    id: "protein-mug-cake",
    name: "Chocolate Protein Mug Cake",
    mealType: "snack",
    imageLabel: "Warm chocolate mug cake",
    ingredients: [ingredient("Protein powder", 1, "scoop", "protein"), ingredient("Oats", 0.25, "cup", "pantry"), ingredient("Cocoa powder", 1, "tbsp", "pantry"), ingredient("Milk", 0.25, "cup", "protein"), ingredient("Banana", 0.5, "each", "produce")],
    steps: ["Mash banana in a mug.", "Stir in remaining ingredients.", "Microwave for 60–90 seconds."],
    calories: 310, protein: 27, carbs: 32, fat: 8,
  },
  {
    id: "hummus-rainbow-plate",
    name: "Hummus Rainbow Plate",
    mealType: "snack",
    imageLabel: "Hummus with colourful vegetable sticks",
    ingredients: [ingredient("Hummus", 0.25, "cup", "pantry"), ingredient("Carrot", 1, "each", "produce"), ingredient("Cucumber", 0.5, "each", "produce"), ingredient("Capsicum", 1, "each", "produce"), ingredient("Wholegrain crackers", 6, "each", "pantry")],
    steps: ["Slice the vegetables into sticks.", "Place hummus in the centre of a plate.", "Add crackers and vegetables around it."],
    calories: 295, protein: 10, carbs: 37, fat: 12,
  },
  {
    id: "chickpea-pita-pocket",
    name: "Chickpea Crunch Pita",
    mealType: "lunch",
    imageLabel: "Stuffed chickpea pita pocket",
    ingredients: [ingredient("Wholegrain pita", 1, "each", "pantry"), ingredient("Chickpeas", 0.5, "cup", "pantry"), ingredient("Greek yogurt", 0.25, "cup", "protein"), ingredient("Cucumber", 0.5, "each", "produce"), ingredient("Tomato", 1, "each", "produce"), ingredient("Lettuce", 1, "cup", "produce")],
    steps: ["Mash chickpeas lightly with yogurt.", "Warm the pita.", "Fill with chickpeas and chopped vegetables."],
    calories: 405, protein: 19, carbs: 63, fat: 9,
  },
];

export function findRecipes(search?: string, mealType?: string) {
  const phrase = search?.trim().toLowerCase();
  return starterRecipes.filter((recipe) => {
    const matchesType = !mealType || recipe.mealType === mealType;
    const searchable = `${recipe.name} ${recipe.mealType} ${recipe.ingredients.map((item) => item.name).join(" ")}`.toLowerCase();
    return matchesType && (!phrase || searchable.includes(phrase));
  });
}