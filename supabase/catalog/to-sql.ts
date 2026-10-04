// Generates the catalog migration from foods.ts. Usage: npx tsx supabase/catalog/to-sql.ts > supabase/migrations/20261004000100_food_catalog.sql
import { FOOD_CATALOG } from "./foods.ts";

const q = (s: string | null | undefined) => (s == null ? "null" : `'${s.replace(/'/g, "''")}'`);
const n = (v: number | null) => (v == null ? "null" : String(v));
const arr = (a: string[]) => `array[${a.map(q).join(",")}]::text[]`;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const lines = FOOD_CATALOG.map((f) =>
  `(${q(f.name)}, ${arr(f.alternate_names)}, ${q(f.category)}, ${q(f.cuisine)}, ${q(f.serving_description)}, ${f.serving_weight_g}, ${f.is_liquid ? "true" : "false"}, ` +
  `${f.calories_per_100g}, ${f.protein_per_100g}, ${f.carbs_per_100g}, ${f.fat_per_100g}, ${n(f.fiber_per_100g)}, ${n(f.sugar_per_100g)}, ${n(f.sodium_mg_per_100g)}, ` +
  `'nutrisnap_curated', ${q(slug(f.name))}, 'curated_estimate', ${q(f.preparation_notes ?? null)})`,
);

console.log(`-- GENERATED from supabase/catalog/foods.ts — do not edit by hand.
-- Reference catalog (not user data). Values are curated estimates; see foods.ts for provenance.
insert into public.food_items (name, alternate_names, category, cuisine, serving_description, serving_weight_g, is_liquid,
  calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g, sugar_per_100g, sodium_mg_per_100g,
  data_source, external_source_id, verification, preparation_notes)
values
${lines.join(",\n")}
on conflict (data_source, external_source_id) do update set
  name = excluded.name, alternate_names = excluded.alternate_names, category = excluded.category,
  serving_description = excluded.serving_description, serving_weight_g = excluded.serving_weight_g,
  calories_per_100g = excluded.calories_per_100g, protein_per_100g = excluded.protein_per_100g,
  carbs_per_100g = excluded.carbs_per_100g, fat_per_100g = excluded.fat_per_100g,
  fiber_per_100g = excluded.fiber_per_100g, sugar_per_100g = excluded.sugar_per_100g,
  sodium_mg_per_100g = excluded.sodium_mg_per_100g, preparation_notes = excluded.preparation_notes;`);
