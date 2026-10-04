/**
 * Starter food catalog (per 100 g edible portion, as typically prepared).
 *
 * PROVENANCE: values are curated approximations compiled from published composition
 * tables (IFCT 2017 for Indian dishes/ingredients, USDA FoodData Central SR Legacy /
 * Foundation for others) and standard home recipes for composite dishes. Composite
 * dishes vary widely by recipe and oil, so every row is marked
 * verification = 'curated_estimate' and should be reviewed by a nutrition professional
 * before production. Foods looked up live from USDA FDC are stored with
 * verification = 'verified_source' and their FDC id.
 *
 * Run `npm run catalog:sql` to regenerate supabase/migrations/*_food_catalog.sql.
 */

export interface CatalogRow {
  name: string;
  alternate_names: string[];
  category: string;
  cuisine: "indian" | "international";
  serving_description: string;
  serving_weight_g: number;
  is_liquid?: boolean;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  fiber_per_100g: number | null;
  sugar_per_100g: number | null;
  sodium_mg_per_100g: number | null;
  preparation_notes?: string;
}

type Tuple = [string, string[], string, CatalogRow["cuisine"], string, number, number, number, number, number, number | null, number | null, number | null, string?, boolean?];

// name, alternates, category, cuisine, serving, serving g, kcal, protein, carbs, fat, fiber, sugar, sodium mg, notes, liquid
const ROWS: Tuple[] = [
  // --- South Indian breakfast & tiffin
  ["Idli", ["idly", "rice idli"], "breakfast", "indian", "1 idli", 40, 140, 4.5, 29, 0.5, 1.2, 0.3, 280, "Steamed rice–urad dal batter"],
  ["Plain dosa", ["dosa", "sada dosa", "dosai"], "breakfast", "indian", "1 medium dosa", 85, 210, 4.4, 30, 7.8, 1.3, 0.4, 330, "With ~1 tsp oil; oil varies widely"],
  ["Masala dosa", ["masala dosai"], "breakfast", "indian", "1 dosa with filling", 180, 190, 3.8, 27, 7.5, 2.0, 1.2, 360, "Dosa with potato masala"],
  ["Rava upma", ["upma", "uppuma", "sooji upma"], "breakfast", "indian", "1 cup", 200, 140, 3.2, 21, 4.8, 1.5, 1.0, 290],
  ["Ven pongal", ["pongal", "khara pongal"], "breakfast", "indian", "1 cup", 200, 150, 4.0, 21, 5.5, 1.0, 0.3, 300, "Rice–moong dal with ghee"],
  ["Medu vada", ["vada", "ulundu vadai", "uzhunnu vada"], "snack", "indian", "1 vada", 50, 300, 9.0, 26, 18, 4.5, 0.8, 360, "Deep fried"],
  ["Poori", ["puri"], "bread", "indian", "1 poori", 30, 330, 6.5, 40, 16, 3.5, 0.8, 340, "Deep fried whole wheat"],
  ["Sambar", ["sambhar"], "curry", "indian", "1 bowl (150 ml)", 150, 75, 3.5, 10, 2.5, 2.8, 2.5, 320, "Toor dal with vegetables", true],
  ["Rasam", ["saaru", "chaaru"], "soup", "indian", "1 bowl (150 ml)", 150, 30, 1.0, 4.5, 1.0, 0.8, 1.5, 350, undefined, true],
  ["Coconut chutney", ["thengai chutney"], "condiment", "indian", "2 tbsp", 30, 200, 2.5, 8, 18, 4.5, 3.0, 300],
  ["Parotta", ["kerala parotta", "porotta", "barotta"], "bread", "indian", "1 parotta", 90, 330, 7.0, 45, 13, 1.8, 1.5, 420, "Maida, layered with oil"],
  ["Appam", ["palappam"], "breakfast", "indian", "1 appam", 60, 160, 2.8, 30, 3.0, 0.8, 3.5, 150],
  ["Idiyappam", ["string hoppers", "noolappam"], "breakfast", "indian", "1 piece", 40, 150, 2.5, 33, 0.4, 0.8, 0.2, 120],
  ["Lemon rice", ["chitranna", "elumichai sadam"], "rice", "indian", "1 cup", 180, 175, 3.0, 28, 5.5, 1.0, 0.4, 310],
  ["Curd rice", ["thayir sadam", "mosaru anna", "dahi chawal"], "rice", "indian", "1 cup", 200, 120, 3.3, 18, 3.6, 0.4, 2.0, 200],
  // --- Staples
  ["Cooked white rice", ["rice", "steamed rice", "plain rice", "white rice", "chawal"], "rice", "indian", "1 cup", 160, 130, 2.7, 28, 0.3, 0.4, 0.1, 1, "USDA FDC 168878 (approx.)"],
  ["Cooked brown rice", ["brown rice"], "rice", "international", "1 cup", 195, 123, 2.7, 26, 1.0, 1.6, 0.2, 4],
  ["Chapati", ["roti", "phulka", "chapathi"], "bread", "indian", "1 medium chapati", 40, 300, 9.0, 50, 7.5, 6.0, 1.0, 320, "Whole wheat, light oil"],
  ["Naan", ["butter naan"], "bread", "indian", "1 naan", 90, 290, 9.0, 50, 5.5, 2.2, 3.5, 470],
  ["Toor dal", ["dal", "dal tadka", "arhar dal", "paruppu"], "curry", "indian", "1 bowl", 150, 115, 6.5, 15, 3.2, 3.5, 1.0, 290, "Cooked with tempering"],
  ["Chana masala", ["chole", "chickpea curry"], "curry", "indian", "1 bowl", 150, 150, 6.5, 18, 5.5, 5.5, 3.0, 350],
  ["Rajma", ["kidney bean curry", "rajma masala"], "curry", "indian", "1 bowl", 150, 135, 6.5, 17, 4.5, 5.5, 2.0, 330],
  ["Vegetable biryani", ["veg biryani"], "rice", "indian", "1 plate", 250, 165, 3.5, 25, 5.5, 2.0, 1.5, 380],
  ["Chicken biryani", ["biryani", "biriyani"], "rice", "indian", "1 plate", 300, 185, 9.0, 22, 6.5, 0.9, 1.0, 400, "Recipe and oil vary widely"],
  ["Mutton biryani", ["lamb biryani"], "rice", "indian", "1 plate", 300, 205, 9.5, 21, 9.0, 0.9, 1.0, 410],
  ["Paneer", ["cottage cheese (Indian)"], "dairy", "indian", "100 g", 100, 290, 18.5, 3.5, 22.5, 0, 2.5, 30],
  ["Paneer butter masala", ["paneer makhani", "paneer curry"], "curry", "indian", "1 bowl", 150, 220, 8.0, 8.5, 17.5, 1.5, 4.0, 420],
  ["Palak paneer", ["saag paneer"], "curry", "indian", "1 bowl", 150, 160, 7.5, 6.0, 12, 2.2, 2.0, 380],
  ["Chicken curry", ["chicken gravy", "kozhi kulambu", "chicken masala"], "curry", "indian", "1 bowl", 200, 150, 13.5, 4.5, 8.5, 1.0, 2.0, 380],
  ["Butter chicken", ["murgh makhani"], "curry", "indian", "1 bowl", 200, 190, 13.0, 6.5, 12.5, 1.0, 3.5, 420],
  ["Fish curry", ["meen kulambu", "meen curry"], "curry", "indian", "1 bowl", 200, 120, 12.0, 4.0, 6.5, 0.8, 1.5, 400],
  ["Fried fish", ["fish fry", "meen varuval"], "protein", "indian", "1 piece", 90, 220, 20.0, 5.0, 13.5, 0.5, 0.2, 450],
  ["Mixed vegetable curry", ["veg curry", "sabzi", "poriyal", "kootu"], "curry", "indian", "1 bowl", 150, 95, 2.5, 9.5, 5.5, 3.0, 3.5, 300],
  ["Aloo sabzi", ["potato curry", "aloo masala", "potato masala"], "curry", "indian", "1 bowl", 150, 115, 2.0, 15, 5.5, 2.0, 1.5, 320],
  ["Plain curd", ["curd", "dahi", "yogurt", "plain yogurt", "thayir"], "dairy", "indian", "1 cup", 200, 61, 3.5, 4.7, 3.3, 0, 4.7, 46, "Whole milk; USDA FDC 171284 (approx.)"],
  ["Raita", ["cucumber raita"], "dairy", "indian", "1 small bowl", 100, 60, 2.8, 5.0, 3.0, 0.5, 4.0, 200],
  ["Samosa", ["aloo samosa"], "snack", "indian", "1 samosa", 60, 300, 5.0, 32, 17, 2.5, 1.5, 420, "Deep fried"],
  ["Pakora", ["bajji", "bhaji", "pakoda"], "snack", "indian", "4 pieces", 60, 300, 6.5, 28, 18, 3.5, 2.0, 400, "Deep fried"],
  ["Murukku", ["chakli"], "snack", "indian", "1 handful", 30, 520, 8.0, 60, 27, 3.0, 1.0, 560],
  ["Poha", ["aval upma", "kanda poha"], "breakfast", "indian", "1 cup", 160, 155, 3.0, 26, 4.5, 1.5, 1.5, 300],
  ["Gulab jamun", [], "dessert", "indian", "1 piece", 40, 320, 4.5, 50, 12, 0.3, 40, 60, "In syrup"],
  ["Masala chai", ["chai", "tea with milk", "milk tea"], "beverage", "indian", "1 cup (150 ml)", 150, 55, 1.8, 7.5, 2.0, 0, 7.0, 25, "With sugar", true],
  ["Filter coffee", ["coffee with milk", "south indian coffee", "kaapi"], "beverage", "indian", "1 tumbler (150 ml)", 150, 60, 2.0, 7.5, 2.2, 0, 7.0, 30, "With milk and sugar", true],
  ["Buttermilk", ["chaas", "mor", "majjige"], "beverage", "indian", "1 glass (200 ml)", 200, 25, 1.4, 2.0, 1.2, 0, 2.0, 160, undefined, true],
  ["Mango lassi", ["lassi"], "beverage", "indian", "1 glass (250 ml)", 250, 95, 2.8, 16, 2.4, 0.3, 15, 40, undefined, true],
  ["Boiled egg", ["egg", "hard boiled egg"], "protein", "international", "1 large egg", 50, 155, 12.6, 1.1, 10.6, 0, 1.1, 124, "USDA FDC 173424 (approx.)"],
  ["Omelette", ["egg omelette", "masala omelette"], "protein", "international", "2-egg omelette", 120, 185, 11.5, 2.0, 14.5, 0.3, 1.0, 330],
  ["Grilled chicken breast", ["chicken breast", "grilled chicken"], "protein", "international", "1 piece", 120, 165, 31.0, 0, 3.6, 0, 0, 74],
  // --- Fruit
  ["Banana", ["kela", "vazhaipazham"], "fruit", "international", "1 medium", 118, 89, 1.1, 22.8, 0.3, 2.6, 12.2, 1],
  ["Apple", [], "fruit", "international", "1 medium", 182, 52, 0.3, 13.8, 0.2, 2.4, 10.4, 1],
  ["Mango", ["aam", "maambazham"], "fruit", "international", "1 cup sliced", 165, 60, 0.8, 15, 0.4, 1.6, 13.7, 1],
  ["Orange", [], "fruit", "international", "1 medium", 131, 47, 0.9, 11.8, 0.1, 2.4, 9.4, 0],
  ["Papaya", [], "fruit", "international", "1 cup", 145, 43, 0.5, 10.8, 0.3, 1.7, 7.8, 8],
  ["Grapes", [], "fruit", "international", "1 cup", 151, 69, 0.7, 18.1, 0.2, 0.9, 15.5, 2],
  ["Watermelon", [], "fruit", "international", "1 cup", 152, 30, 0.6, 7.6, 0.2, 0.4, 6.2, 1],
  // --- International
  ["Whole milk", ["milk"], "beverage", "international", "1 glass (250 ml)", 250, 61, 3.2, 4.8, 3.3, 0, 5.1, 43, undefined, true],
  ["Orange juice", [], "beverage", "international", "1 glass (250 ml)", 250, 45, 0.7, 10.4, 0.2, 0.2, 8.4, 1, undefined, true],
  ["Cola", ["soft drink", "soda"], "beverage", "international", "1 can (330 ml)", 330, 42, 0, 10.6, 0, 0, 10.6, 4, undefined, true],
  ["Black coffee", ["americano"], "beverage", "international", "1 cup (240 ml)", 240, 1, 0.1, 0, 0, 0, 0, 2, undefined, true],
  ["White bread", ["bread", "sandwich bread"], "bread", "international", "1 slice", 28, 265, 9.0, 49, 3.2, 2.7, 5.0, 490],
  ["Whole wheat bread", ["brown bread"], "bread", "international", "1 slice", 32, 250, 12.5, 43, 3.5, 6.0, 5.5, 450],
  ["Oatmeal", ["oats porridge", "porridge"], "breakfast", "international", "1 cup cooked", 235, 71, 2.5, 12, 1.5, 1.7, 0.3, 49, "Made with water"],
  ["Pasta with tomato sauce", ["spaghetti", "pasta"], "mixed", "international", "1 plate", 250, 130, 4.5, 22, 2.8, 2.0, 3.5, 260],
  ["Cheese pizza", ["pizza", "margherita pizza"], "mixed", "international", "1 slice", 107, 266, 11.4, 33, 9.7, 2.3, 3.6, 600],
  ["Hamburger", ["burger", "beef burger"], "mixed", "international", "1 burger", 220, 250, 13.0, 25, 11, 1.5, 5.0, 480],
  ["French fries", ["fries", "chips"], "snack", "international", "1 medium serving", 117, 312, 3.4, 41, 15, 3.8, 0.3, 210],
  ["Green salad", ["salad", "garden salad"], "vegetable", "international", "1 bowl", 100, 20, 1.3, 3.5, 0.2, 1.8, 2.0, 25, "Without dressing"],
  ["Chicken fried rice", ["fried rice"], "rice", "international", "1 plate", 300, 165, 7.5, 21, 5.5, 1.0, 1.0, 450],
  ["Vegetable noodles", ["noodles", "hakka noodles", "chow mein"], "mixed", "international", "1 plate", 250, 150, 4.0, 22, 5.0, 1.8, 2.0, 520],
  ["Peanuts", ["groundnuts"], "snack", "international", "1 handful", 30, 567, 25.8, 16.1, 49.2, 8.5, 4.7, 18],
  ["Almonds", ["badam"], "snack", "international", "10 almonds", 12, 579, 21.2, 21.6, 49.9, 12.5, 4.4, 1],
  ["Ice cream", ["vanilla ice cream"], "dessert", "international", "1 scoop", 66, 207, 3.5, 23.6, 11, 0.7, 21.2, 80],
  ["Dark chocolate", ["chocolate"], "dessert", "international", "2 squares", 20, 546, 4.9, 61, 31, 7.0, 48, 24],
];

export const FOOD_CATALOG: CatalogRow[] = ROWS.map(
  ([name, alternate_names, category, cuisine, serving_description, serving_weight_g, kcal, p, c, f, fiber, sugar, sodium, notes, liquid]) => ({
    name, alternate_names, category, cuisine, serving_description, serving_weight_g,
    is_liquid: liquid ?? false,
    calories_per_100g: kcal, protein_per_100g: p, carbs_per_100g: c, fat_per_100g: f,
    fiber_per_100g: fiber, sugar_per_100g: sugar, sodium_mg_per_100g: sodium,
    preparation_notes: notes,
  }),
);
