-- Authorization & data-isolation tests + meal logging integration tests.
-- Run: scripts/test-db.sh  (plain Postgres + shim)  — fails on the first broken assertion.
\set ON_ERROR_STOP on
\pset tuples_only on
\o /dev/null
begin;

-- Two users (the auth trigger creates their profiles).
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@test.dev', '{"display_name":"Asha"}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@test.dev', '{"display_name":"Ben"}');

create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'ASSERTION FAILED: %', msg; end if; end $$;

-- ---------------------------------------------------------------- profile trigger
select pg_temp.assert((select count(*) from public.profiles) = 2, 'profiles auto-created');
select pg_temp.assert((select display_name from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') = 'Asha', 'display name copied');

-- ---------------------------------------------------------------- user A logs a meal via RPC
select pg_temp.as_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select pg_temp.assert((select count(*) from public.food_items) > 50, 'catalog readable by authenticated users');

create temp table ids (k text primary key, v uuid) on commit drop;
grant all on ids to authenticated;

insert into ids values ('idli', (select id from public.food_items where name = 'Idli'));
insert into ids values ('sambar', (select id from public.food_items where name = 'Sambar'));

insert into ids values ('meal1', public.save_meal(
  jsonb_build_object('meal_type','breakfast','analysis_status','confirmed','client_request_id','11111111-1111-4111-8111-111111111111',
                     'image_storage_path','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/x.jpg'),
  jsonb_build_array(
    jsonb_build_object('food_item_id',(select v from ids where k='idli'),'display_name','Idli','serving_quantity',3,'serving_unit','1 idli','serving_weight_g',120,
      'calories_kcal',168,'protein_g',5.4,'carbs_g',34.8,'fat_g',0.6,'nutrition_source','nutrisnap_curated','user_confirmed',true,
      'ai_suggested_name','rice cake','ai_estimated_weight_g',110),
    jsonb_build_object('food_item_id',(select v from ids where k='sambar'),'display_name','Sambar','serving_quantity',1,'serving_unit','bowl','serving_weight_g',150,
      'calories_kcal',113,'protein_g',5.3,'carbs_g',15,'fat_g',3.8,'nutrition_source','nutrisnap_curated','user_confirmed',true))));

select pg_temp.assert((select total_calories_kcal from public.meal_logs where id = (select v from ids where k='meal1')) = 281, 'meal totals computed by trigger');
select pg_temp.assert((select total_protein_g from public.meal_logs where id = (select v from ids where k='meal1')) = 10.7, 'protein totals');

-- Duplicate submission (same client_request_id) returns the same meal, no new rows.
select pg_temp.assert(public.save_meal(
  jsonb_build_object('meal_type','breakfast','analysis_status','confirmed','client_request_id','11111111-1111-4111-8111-111111111111'),
  jsonb_build_array(jsonb_build_object('custom_food_name','x','display_name','x','serving_quantity',1,'serving_unit','g','serving_weight_g',1,'calories_kcal',1,'protein_g',0,'carbs_g',0,'fat_g',0)))
  = (select v from ids where k='meal1'), 'idempotent save');
select pg_temp.assert((select count(*) from public.meal_logs) = 1, 'no duplicate meal');

-- Personal correction remembered.
select pg_temp.assert((select corrected_name from public.food_corrections where ai_name = 'rice cake') = 'Idli', 'correction stored');

-- Edit: replace items → totals recalculated.
select public.save_meal(
  jsonb_build_object('id',(select v from ids where k='meal1'),'meal_type','breakfast','analysis_status','confirmed'),
  jsonb_build_array(jsonb_build_object('food_item_id',(select v from ids where k='idli'),'display_name','Idli','serving_quantity',2,'serving_unit','1 idli','serving_weight_g',80,
      'calories_kcal',112,'protein_g',3.6,'carbs_g',23.2,'fat_g',0.4,'nutrition_source','nutrisnap_curated','user_confirmed',true)));
select pg_temp.assert((select total_calories_kcal from public.meal_logs where id = (select v from ids where k='meal1')) = 112, 'totals after edit');

-- Deleting an item recalculates; empty meal → 0.
delete from public.meal_items where meal_log_id = (select v from ids where k='meal1');
select pg_temp.assert((select total_calories_kcal from public.meal_logs where id = (select v from ids where k='meal1')) = 0, 'totals after item delete');

-- Validation: invalid serving weight rejected.
do $$ begin
  perform public.save_meal(jsonb_build_object('meal_type','lunch'),
    jsonb_build_array(jsonb_build_object('custom_food_name','bad','display_name','bad','serving_quantity',1,'serving_unit','g','serving_weight_g',-5,'calories_kcal',1,'protein_g',0,'carbs_g',0,'fat_g',0)));
  raise exception 'should have failed';
exception when check_violation then null; end $$;
-- Empty meals rejected.
do $$ begin
  perform public.save_meal(jsonb_build_object('meal_type','lunch'), '[]'::jsonb);
  raise exception 'should have failed';
exception when invalid_parameter_value then null; end $$;

insert into public.water_logs (volume_ml) values (250);
insert into public.weight_logs (weight_kg) values (70.5);
insert into public.activity_logs (activity_type, started_at, duration_minutes, calories_burned_kcal) values ('walking', now(), 30, 120);

-- Catalog is read-only for clients.
do $$ begin
  insert into public.food_items (name, category, serving_description, serving_weight_g, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, data_source)
  values ('Hack', 'x', 'x', 1, 1, 0, 0, 0, 'x');
  raise exception 'catalog insert should be denied';
exception when insufficient_privilege then null; end $$;

-- Storage: own folder allowed, other folder denied.
insert into storage.objects (bucket_id, name) values ('meal-images', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/ok.jpg');
do $$ begin
  insert into storage.objects (bucket_id, name) values ('meal-images', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/evil.jpg');
  raise exception 'cross-folder upload should be denied';
exception when insufficient_privilege then null; end $$;

-- ---------------------------------------------------------------- user B cannot see or touch A's data
reset role;
select pg_temp.as_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select pg_temp.assert((select count(*) from public.meal_logs) = 0, 'B sees no meals of A');
select pg_temp.assert((select count(*) from public.water_logs) = 0, 'B sees no water of A');
select pg_temp.assert((select count(*) from public.weight_logs) = 0, 'B sees no weight of A');
select pg_temp.assert((select count(*) from public.activity_logs) = 0, 'B sees no activity of A');
select pg_temp.assert((select count(*) from public.food_corrections) = 0, 'B sees no corrections of A');
select pg_temp.assert((select count(*) from public.profiles) = 1, 'B sees only own profile');
select pg_temp.assert((select count(*) from storage.objects) = 0, 'B sees no photos of A');

update public.meal_logs set notes = 'pwned' where id = (select v from ids where k='meal1');
delete from public.water_logs;
reset role;
select pg_temp.assert((select notes from public.meal_logs where id = (select v from ids where k='meal1')) is null, 'B update had no effect');
select pg_temp.assert((select count(*) from public.water_logs) = 1, 'B delete had no effect');
select pg_temp.as_user('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- B cannot insert rows claiming to be A.
do $$ begin
  insert into public.water_logs (user_id, volume_ml) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 100);
  raise exception 'spoofed insert should be denied';
exception when insufficient_privilege then null; end $$;

-- B cannot attach items to A's meal (owner check trigger / RLS).
do $$ begin
  insert into public.meal_items (meal_log_id, custom_food_name, display_name, serving_quantity, serving_unit, serving_weight_g, calories_kcal, protein_g, carbs_g, fat_g, nutrition_source)
  values ((select v from ids where k='meal1'), 'x', 'x', 1, 'g', 1, 1, 0, 0, 0, 'user_entered');
  raise exception 'cross-user item insert should be denied';
exception when insufficient_privilege then null; end $$;

-- B cannot edit A's meal through the RPC.
do $$ begin
  perform public.save_meal(jsonb_build_object('id',(select v from ids where k='meal1'),'meal_type','dinner'),
    jsonb_build_array(jsonb_build_object('custom_food_name','x','display_name','x','serving_quantity',1,'serving_unit','g','serving_weight_g',1,'calories_kcal',1,'protein_g',0,'carbs_g',0,'fat_g',0)));
  raise exception 'cross-user RPC edit should fail';
exception when no_data_found then null; end $$;

-- Rate-limit table and AI jobs are not writable by clients.
do $$ begin
  insert into public.rate_limit_events (user_id, bucket) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'x');
  raise exception 'rate limit insert should be denied';
exception when insufficient_privilege then null; end $$;

-- Anonymous users see nothing personal.
reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
do $$ declare n int; begin
  select count(*) into n from public.meal_logs;   -- Supabase grants anon table access; RLS must return nothing
  if n <> 0 then raise exception 'anon can read meal_logs'; end if;
exception when insufficient_privilege then null; end $$;
reset role;

-- ---------------------------------------------------------------- account deletion cascades
delete from auth.users where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
select pg_temp.assert((select count(*) from public.meal_logs) = 0, 'meals cascade on account delete');
select pg_temp.assert((select count(*) from public.water_logs) = 0, 'water cascades');
select pg_temp.assert((select count(*) from public.profiles) = 1, 'profile cascades');

\o
select 'ALL DB TESTS PASSED' as result;
rollback;
