-- NutriSnap AI — initial schema
-- All personal tables carry user_id and are protected by Row Level Security.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.meal_type as enum ('breakfast','morning_snack','lunch','evening_snack','dinner','other');
create type public.analysis_status as enum ('draft','analyzing','needs_review','confirmed','saved_unconfirmed','manual','failed');
create type public.activity_level as enum ('sedentary','light','moderate','active','very_active');
create type public.primary_goal as enum ('maintain','lose_gradual','gain_muscle','awareness');
create type public.unit_system as enum ('metric','imperial');
create type public.budget_method as enum ('base','exercise_adjusted');
create type public.intensity as enum ('light','moderate','vigorous');
create type public.data_verification as enum ('verified_source','curated_estimate','user_entered','ai_estimate');

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  date_of_birth date check (date_of_birth > '1900-01-01' and date_of_birth < current_date),
  sex text not null default 'unspecified' check (sex in ('male','female','unspecified')),
  height_cm numeric(5,1) check (height_cm between 100 and 250),
  current_weight_kg numeric(5,2) check (current_weight_kg between 25 and 350),
  target_weight_kg numeric(5,2) check (target_weight_kg between 25 and 350),
  activity_level public.activity_level not null default 'light',
  primary_goal public.primary_goal not null default 'awareness',
  dietary_preferences text[] not null default '{}',
  allergies text[] not null default '{}',
  pregnant_or_breastfeeding boolean not null default false,
  calorie_target_kcal int not null default 2000 check (calorie_target_kcal between 800 and 6000),
  calorie_target_is_manual boolean not null default false,
  protein_target_g int not null default 75 check (protein_target_g between 0 and 500),
  carbohydrate_target_g int not null default 250 check (carbohydrate_target_g between 0 and 1000),
  fat_target_g int not null default 65 check (fat_target_g between 0 and 400),
  water_target_ml int not null default 2500 check (water_target_ml between 500 and 8000),
  preferred_units public.unit_system not null default 'metric',
  budget_method public.budget_method not null default 'base',
  time_zone text not null default 'UTC',
  onboarding_completed boolean not null default false,
  ai_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- food_items: shared reference catalog (read-only to clients)
-- ---------------------------------------------------------------------------
create table public.food_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  alternate_names text[] not null default '{}',
  category text not null,
  cuisine text,
  serving_description text not null,
  serving_weight_g numeric(7,1) not null check (serving_weight_g > 0),
  is_liquid boolean not null default false,
  calories_per_100g numeric(6,1) not null check (calories_per_100g between 0 and 902),
  protein_per_100g numeric(5,1) not null check (protein_per_100g between 0 and 100),
  carbs_per_100g numeric(5,1) not null check (carbs_per_100g between 0 and 100),
  fat_per_100g numeric(5,1) not null check (fat_per_100g between 0 and 100),
  fiber_per_100g numeric(5,1) check (fiber_per_100g between 0 and 100),
  sugar_per_100g numeric(5,1) check (sugar_per_100g between 0 and 100),
  saturated_fat_per_100g numeric(5,1) check (saturated_fat_per_100g between 0 and 100),
  sodium_mg_per_100g numeric(7,1) check (sodium_mg_per_100g between 0 and 40000),
  data_source text not null,           -- e.g. 'usda_fdc', 'ifct_2017', 'nutrisnap_curated'
  external_source_id text,
  verification public.data_verification not null default 'curated_estimate',
  preparation_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (protein_per_100g + carbs_per_100g + fat_per_100g <= 100.5),
  unique (data_source, external_source_id)
);
create index food_items_name_trgm on public.food_items using gin (name extensions.gin_trgm_ops);
create index food_items_category on public.food_items (category);
create trigger food_items_updated before update on public.food_items for each row execute function public.set_updated_at();

-- Search helper used by the app and the edge functions.
create or replace function public.search_foods(q text, max_results int default 20)
returns setof public.food_items
language sql stable
set search_path = public, extensions
as $$
  select f.* from public.food_items f
  where q is not null and char_length(trim(q)) > 0 and (
    f.name ilike '%' || q || '%'
    or exists (select 1 from unnest(f.alternate_names) a where a ilike '%' || q || '%')
    or similarity(f.name, q) > 0.3
  )
  order by (lower(f.name) = lower(q)) desc, similarity(f.name, q) desc, f.name
  limit least(greatest(max_results, 1), 50);
$$;

-- ---------------------------------------------------------------------------
-- meal_logs / meal_items
-- ---------------------------------------------------------------------------
create table public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  logged_at timestamptz not null default now(),
  meal_type public.meal_type not null,
  custom_meal_name text check (char_length(custom_meal_name) <= 40),
  image_storage_path text,
  notes text check (char_length(notes) <= 1000),
  total_calories_kcal int not null default 0,
  total_protein_g numeric(7,1) not null default 0,
  total_carbs_g numeric(7,1) not null default 0,
  total_fat_g numeric(7,1) not null default 0,
  analysis_status public.analysis_status not null default 'manual',
  analysis_job_id uuid,
  client_request_id uuid,  -- idempotency key for duplicate submissions
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_request_id)
);
create index meal_logs_user_time on public.meal_logs (user_id, logged_at desc);
create trigger meal_logs_updated before update on public.meal_logs for each row execute function public.set_updated_at();

create table public.meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_log_id uuid not null references public.meal_logs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  food_item_id uuid references public.food_items(id) on delete set null,
  custom_food_name text check (char_length(custom_food_name) <= 120),
  display_name text not null check (char_length(display_name) between 1 and 120),
  serving_quantity numeric(7,2) not null check (serving_quantity > 0 and serving_quantity <= 100),
  serving_unit text not null check (char_length(serving_unit) between 1 and 40),
  serving_weight_g numeric(7,1) not null check (serving_weight_g > 0 and serving_weight_g <= 5000),
  calories_kcal int not null check (calories_kcal between 0 and 20000),
  protein_g numeric(6,1) not null check (protein_g >= 0),
  carbs_g numeric(6,1) not null check (carbs_g >= 0),
  fat_g numeric(6,1) not null check (fat_g >= 0),
  fiber_g numeric(6,1) check (fiber_g >= 0),
  sugar_g numeric(6,1) check (sugar_g >= 0),
  saturated_fat_g numeric(6,1) check (saturated_fat_g >= 0),
  sodium_mg numeric(8,1) check (sodium_mg >= 0),
  estimate_confidence numeric(3,2) check (estimate_confidence between 0 and 1),
  nutrition_source text not null,      -- data_source of the food, or 'user_entered'
  is_approximate boolean not null default false,
  user_confirmed boolean not null default false,
  ai_suggested_name text,              -- what the model proposed, kept for correction learning
  ai_estimated_weight_g numeric(7,1),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (food_item_id is not null or custom_food_name is not null)
);
create index meal_items_meal on public.meal_items (meal_log_id);
create index meal_items_user on public.meal_items (user_id);
create trigger meal_items_updated before update on public.meal_items for each row execute function public.set_updated_at();

-- An item must belong to a meal owned by the same user.
create or replace function public.meal_items_check_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.meal_logs m where m.id = new.meal_log_id and m.user_id = new.user_id) then
    raise exception 'meal item owner mismatch' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger meal_items_owner before insert or update on public.meal_items
  for each row execute function public.meal_items_check_owner();

-- Keep meal_logs totals in sync after every item create/update/delete.
create or replace function public.recalc_meal_totals() returns trigger
language plpgsql security definer set search_path = public as $$
declare mid uuid;
begin
  for mid in select distinct x from unnest(array[
      case when tg_op in ('INSERT','UPDATE') then new.meal_log_id end,
      case when tg_op in ('UPDATE','DELETE') then old.meal_log_id end]) x where x is not null
  loop
    update public.meal_logs m set
      total_calories_kcal = coalesce(s.cal, 0),
      total_protein_g = coalesce(s.p, 0),
      total_carbs_g = coalesce(s.c, 0),
      total_fat_g = coalesce(s.f, 0)
    from (select sum(calories_kcal) cal, sum(protein_g) p, sum(carbs_g) c, sum(fat_g) f
          from public.meal_items where meal_log_id = mid) s
    where m.id = mid;
  end loop;
  return null;
end $$;
create trigger meal_items_totals after insert or update or delete on public.meal_items
  for each row execute function public.recalc_meal_totals();

-- ---------------------------------------------------------------------------
-- AI analysis jobs (one per photo submission)
-- ---------------------------------------------------------------------------
create table public.ai_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  image_storage_path text not null,
  client_request_id uuid not null,
  status text not null default 'pending' check (status in ('pending','processing','succeeded','failed')),
  provider text,
  model text,
  result jsonb,              -- validated, matched candidates returned to the client
  error_code text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, client_request_id)
);
create index ai_jobs_user_time on public.ai_analysis_jobs (user_id, created_at desc);

-- Simple fixed-window rate limiting for AI endpoints (written by service role only).
create table public.rate_limit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null,
  created_at timestamptz not null default now()
);
create index rate_limit_lookup on public.rate_limit_events (user_id, bucket, created_at desc);

-- ---------------------------------------------------------------------------
-- Activity, water, weight
-- ---------------------------------------------------------------------------
create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  activity_type text not null check (activity_type in ('walking','running','cycling','swimming','gym','strength','yoga','basketball','other')),
  custom_name text check (char_length(custom_name) <= 60),
  started_at timestamptz not null,
  duration_minutes numeric(6,1) not null check (duration_minutes > 0 and duration_minutes <= 1440),
  distance_m numeric(9,1) check (distance_m >= 0 and distance_m <= 1000000),
  calories_burned_kcal int check (calories_burned_kcal between 0 and 10000),
  calories_is_estimate boolean not null default true,
  intensity public.intensity not null default 'moderate',
  steps int check (steps >= 0),
  source text not null default 'manual' check (source in ('manual','health_connect','healthkit')),
  external_activity_id text,
  created_at timestamptz not null default now(),
  unique (user_id, source, external_activity_id)
);
create index activity_user_time on public.activity_logs (user_id, started_at desc);

create table public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  logged_at timestamptz not null default now(),
  volume_ml int not null check (volume_ml between 1 and 5000),
  created_at timestamptz not null default now()
);
create index water_user_time on public.water_logs (user_id, logged_at desc);

create table public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  measured_at timestamptz not null default now(),
  weight_kg numeric(5,2) not null check (weight_kg between 25 and 350),
  created_at timestamptz not null default now()
);
create index weight_user_time on public.weight_logs (user_id, measured_at desc);

-- ---------------------------------------------------------------------------
-- Saved meals & favorites
-- ---------------------------------------------------------------------------
create table public.saved_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 80),
  meal_type public.meal_type,
  -- Array of item snapshots: {display_name, food_item_id, custom_food_name, serving_quantity,
  -- serving_unit, serving_weight_g, calories_kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, nutrition_source, is_approximate}
  meal_definition_json jsonb not null check (jsonb_typeof(meal_definition_json) = 'array' and jsonb_array_length(meal_definition_json) between 1 and 30),
  created_at timestamptz not null default now()
);
create index saved_meals_user on public.saved_meals (user_id, created_at desc);

create table public.food_favorites (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  food_item_id uuid not null references public.food_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, food_item_id)
);

-- Personal corrections: "the model said X, I meant food Y at ~Z g".
create table public.food_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  ai_name text not null,
  corrected_food_item_id uuid references public.food_items(id) on delete cascade,
  corrected_name text not null,
  typical_weight_g numeric(7,1),
  times_used int not null default 1,
  updated_at timestamptz not null default now(),
  unique (user_id, ai_name)
);

-- Reminder preferences (notifications are configured client-side).
create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  reminders jsonb not null default '{}'::jsonb,
  store_meal_images boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Assistant conversations (kept so users can review/delete them).
create table public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  role text not null check (role in ('user','assistant')),
  content text not null check (char_length(content) <= 8000),
  created_at timestamptz not null default now()
);
create index assistant_user_time on public.assistant_messages (user_id, created_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.food_items enable row level security;
alter table public.meal_logs enable row level security;
alter table public.meal_items enable row level security;
alter table public.ai_analysis_jobs enable row level security;
alter table public.rate_limit_events enable row level security;
alter table public.activity_logs enable row level security;
alter table public.water_logs enable row level security;
alter table public.weight_logs enable row level security;
alter table public.saved_meals enable row level security;
alter table public.food_favorites enable row level security;
alter table public.food_corrections enable row level security;
alter table public.user_preferences enable row level security;
alter table public.assistant_messages enable row level security;

create policy profiles_own on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Catalog: readable by signed-in users; writes only via service role (edge functions).
create policy food_items_read on public.food_items for select to authenticated using (true);

-- Analysis jobs: users can read their own; only the edge function (service role) writes.
create policy ai_jobs_read_own on public.ai_analysis_jobs for select to authenticated
  using (user_id = (select auth.uid()));

-- rate_limit_events: no policies → no client access.

do $$
declare t text;
begin
  foreach t in array array['meal_logs','meal_items','activity_logs','water_logs','weight_logs',
                           'saved_meals','food_favorites','food_corrections','user_preferences','assistant_messages']
  loop
    execute format('create policy %1$s_own on public.%1$s for all to authenticated
                    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Storage: private bucket for meal photos, path = <user_id>/<file>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meal-images', 'meal-images', false, 8388608, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;

create policy meal_images_select on storage.objects for select to authenticated
  using (bucket_id = 'meal-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy meal_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'meal-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy meal_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'meal-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Atomic meal save (meal + items in one transaction, idempotent on client_request_id)
-- Runs as the caller (security invoker) so RLS still applies.
-- ---------------------------------------------------------------------------
create or replace function public.save_meal(
  p_meal jsonb,
  p_items jsonb
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
  v_uid uuid := auth.uid();
  v_req uuid := nullif(p_meal->>'client_request_id','')::uuid;
  it jsonb;
  i int := 0;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'a meal needs at least one item' using errcode = '22023';
  end if;

  if v_req is not null then
    select id into v_id from public.meal_logs where user_id = v_uid and client_request_id = v_req;
    if v_id is not null then return v_id; end if;  -- duplicate submission
  end if;

  if (p_meal ? 'id') and nullif(p_meal->>'id','') is not null then
    -- Update existing meal: replace its items.
    v_id := (p_meal->>'id')::uuid;
    update public.meal_logs set
      logged_at = coalesce((p_meal->>'logged_at')::timestamptz, logged_at),
      meal_type = coalesce((p_meal->>'meal_type')::public.meal_type, meal_type),
      custom_meal_name = p_meal->>'custom_meal_name',
      notes = p_meal->>'notes',
      analysis_status = coalesce((p_meal->>'analysis_status')::public.analysis_status, analysis_status)
    where id = v_id and user_id = v_uid;
    if not found then raise exception 'meal not found' using errcode = 'P0002'; end if;
    delete from public.meal_items where meal_log_id = v_id;
  else
    insert into public.meal_logs (user_id, logged_at, meal_type, custom_meal_name, image_storage_path, notes,
                                  analysis_status, analysis_job_id, client_request_id)
    values (v_uid,
            coalesce((p_meal->>'logged_at')::timestamptz, now()),
            (p_meal->>'meal_type')::public.meal_type,
            p_meal->>'custom_meal_name',
            p_meal->>'image_storage_path',
            p_meal->>'notes',
            coalesce((p_meal->>'analysis_status')::public.analysis_status, 'manual'),
            nullif(p_meal->>'analysis_job_id','')::uuid,
            v_req)
    returning id into v_id;
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    insert into public.meal_items (meal_log_id, user_id, food_item_id, custom_food_name, display_name,
      serving_quantity, serving_unit, serving_weight_g, calories_kcal, protein_g, carbs_g, fat_g,
      fiber_g, sugar_g, saturated_fat_g, sodium_mg, estimate_confidence, nutrition_source,
      is_approximate, user_confirmed, ai_suggested_name, ai_estimated_weight_g, sort_order)
    values (v_id, v_uid,
      nullif(it->>'food_item_id','')::uuid,
      it->>'custom_food_name',
      it->>'display_name',
      (it->>'serving_quantity')::numeric,
      it->>'serving_unit',
      (it->>'serving_weight_g')::numeric,
      round((it->>'calories_kcal')::numeric)::int,
      (it->>'protein_g')::numeric, (it->>'carbs_g')::numeric, (it->>'fat_g')::numeric,
      (it->>'fiber_g')::numeric, (it->>'sugar_g')::numeric,
      (it->>'saturated_fat_g')::numeric, (it->>'sodium_mg')::numeric,
      (it->>'estimate_confidence')::numeric,
      coalesce(it->>'nutrition_source', 'user_entered'),
      coalesce((it->>'is_approximate')::boolean, false),
      coalesce((it->>'user_confirmed')::boolean, false),
      it->>'ai_suggested_name',
      (it->>'ai_estimated_weight_g')::numeric,
      i);
    i := i + 1;

    -- Remember personal corrections of AI names.
    if it->>'ai_suggested_name' is not null and coalesce((it->>'user_confirmed')::boolean,false)
       and lower(it->>'ai_suggested_name') <> lower(it->>'display_name') then
      insert into public.food_corrections (user_id, ai_name, corrected_food_item_id, corrected_name, typical_weight_g)
      values (v_uid, lower(it->>'ai_suggested_name'), nullif(it->>'food_item_id','')::uuid, it->>'display_name',
              (it->>'serving_weight_g')::numeric)
      on conflict (user_id, ai_name) do update set
        corrected_food_item_id = excluded.corrected_food_item_id,
        corrected_name = excluded.corrected_name,
        typical_weight_g = excluded.typical_weight_g,
        times_used = public.food_corrections.times_used + 1,
        updated_at = now();
    end if;
  end loop;

  return v_id;
end $$;

grant execute on function public.save_meal(jsonb, jsonb) to authenticated;
grant execute on function public.search_foods(text, int) to authenticated;

-- Create a profile row automatically for new users.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'display_name',''), 'Friend'))
  on conflict (id) do nothing;
  insert into public.user_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
