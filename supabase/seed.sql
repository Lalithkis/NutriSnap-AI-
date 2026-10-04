-- =============================================================================
-- DEVELOPMENT SEED DATA — applied by `supabase db reset` on LOCAL projects only.
-- Never run against production. Creates one demo account with sample logs:
--   email: demo@nutrisnap.dev   password: demo-password-123
-- The food catalog itself lives in migrations (reference data, not user data).
-- =============================================================================
do $$
declare
  uid uuid := '00000000-0000-4000-8000-00000000d3e0';
  meal uuid;
  d int;
begin
  if exists (select 1 from auth.users where id = uid) then return; end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', 'demo@nutrisnap.dev',
          extensions.crypt('demo-password-123', extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', '{"display_name":"Demo"}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', 'demo@nutrisnap.dev'), 'email', now(), now(), now());

  update public.profiles set
    date_of_birth = '1994-05-12', sex = 'female', height_cm = 162, current_weight_kg = 61, target_weight_kg = 58,
    activity_level = 'light', primary_goal = 'lose_gradual', dietary_preferences = '{vegetarian}', allergies = '{peanuts}',
    calorie_target_kcal = 1650, protein_target_g = 85, carbohydrate_target_g = 200, fat_target_g = 51, water_target_ml = 2000,
    time_zone = 'Asia/Kolkata', onboarding_completed = true, ai_consent_at = now()
  where id = uid;

  for d in 0..6 loop
    insert into public.meal_logs (user_id, logged_at, meal_type, analysis_status)
      values (uid, (current_date - d) + time '08:30' - interval '5 hours 30 minutes', 'breakfast', 'manual') returning id into meal;
    insert into public.meal_items (meal_log_id, user_id, food_item_id, display_name, serving_quantity, serving_unit, serving_weight_g,
                                   calories_kcal, protein_g, carbs_g, fat_g, nutrition_source, is_approximate, user_confirmed)
    select meal, uid, f.id, f.name, q, f.serving_description, q * f.serving_weight_g,
           round(f.calories_per_100g * q * f.serving_weight_g / 100), round(f.protein_per_100g * q * f.serving_weight_g / 100, 1),
           round(f.carbs_per_100g * q * f.serving_weight_g / 100, 1), round(f.fat_per_100g * q * f.serving_weight_g / 100, 1),
           f.data_source, true, true
    from (values ('Idli', 3), ('Sambar', 1), ('Coconut chutney', 1)) v(n, q) join public.food_items f on f.name = v.n;

    insert into public.meal_logs (user_id, logged_at, meal_type, analysis_status)
      values (uid, (current_date - d) + time '13:15' - interval '5 hours 30 minutes', 'lunch', 'manual') returning id into meal;
    insert into public.meal_items (meal_log_id, user_id, food_item_id, display_name, serving_quantity, serving_unit, serving_weight_g,
                                   calories_kcal, protein_g, carbs_g, fat_g, nutrition_source, is_approximate, user_confirmed)
    select meal, uid, f.id, f.name, q, f.serving_description, q * f.serving_weight_g,
           round(f.calories_per_100g * q * f.serving_weight_g / 100), round(f.protein_per_100g * q * f.serving_weight_g / 100, 1),
           round(f.carbs_per_100g * q * f.serving_weight_g / 100, 1), round(f.fat_per_100g * q * f.serving_weight_g / 100, 1),
           f.data_source, true, true
    from (values ('Cooked white rice', 1), ('Toor dal', 1), ('Mixed vegetable curry', 1), ('Plain curd', 0.5)) v(n, q) join public.food_items f on f.name = v.n;

    insert into public.water_logs (user_id, logged_at, volume_ml)
      select uid, (current_date - d) + (h || ' hours')::interval - interval '5 hours 30 minutes', 250 from generate_series(8, 18, 2) h;
    if d % 2 = 0 then
      insert into public.activity_logs (user_id, activity_type, started_at, duration_minutes, calories_burned_kcal, intensity)
        values (uid, 'walking', (current_date - d) + time '18:00' - interval '5 hours 30 minutes', 35, 75, 'moderate');
    end if;
    insert into public.weight_logs (user_id, measured_at, weight_kg) values (uid, (current_date - d) + time '07:00' - interval '5 hours 30 minutes', 61 + d * 0.1);
  end loop;
end $$;
