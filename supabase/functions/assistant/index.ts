/**
 * POST /functions/v1/assistant  { message: string, time_zone?: string }
 *
 * Nutrition assistant that answers from the user's own records. Data access goes
 * through the caller's RLS-scoped client, so the model can only ever see this
 * user's rows. Tool results state explicitly when data is missing.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { adminClient, authenticate, env, handler, HttpError, json, readJson } from "../_shared/http.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { addDays, computeDailySummary, localDayBounds, toLocalDate, type BudgetMethod } from "../_shared/daily.ts";

const Body = z.object({ message: z.string().trim().min(1).max(2000), time_zone: z.string().max(64).optional() });
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const MAX_RANGE_DAYS = 92;

const SYSTEM = `You are NutriSnap's nutrition assistant. You help the user understand their own food, water and activity logs and suggest practical, balanced meals.

Rules:
- For any question about what the user ate, drank, burned or how they are tracking, call the tools and answer only from what they return. If the records are empty or missing, say so plainly — never guess or invent meals, activities or numbers.
- Logged nutrition values are estimates (photo portions and recipes vary); say so when precision matters.
- Activity calories are estimates of exercise energy only; they are not total daily energy expenditure. Net intake (food minus tracked exercise) is not a full energy balance.
- Meal suggestions must respect the user's dietary preferences and allergies from get_profile, and should be culturally familiar to them (e.g. Indian home cooking when relevant).
- You provide general nutrition education, not medical advice. Do not diagnose conditions or prescribe extreme diets. For pregnancy, under-18s, eating-disorder concerns, diabetes, kidney disease or other medical conditions, recommend a doctor or registered dietitian.
- Be encouraging and non-judgemental about missed goals or weight changes.
- Keep answers concise and use the user's units.`;

const tools: Anthropic.Tool[] = [
  {
    name: "get_profile",
    description: "Get the user's goals and targets (calories, protein, carbs, fat, water), units, dietary preferences, allergies and calorie budget method.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    name: "get_daily_summary",
    description: "Totals for one local calendar day: calories, macros, water, activity calories/minutes, remaining calories (base and exercise-adjusted) and meal count.",
    input_schema: { type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD in the user's local time" } }, required: ["date"], additionalProperties: false },
    strict: true,
  },
  {
    name: "list_meals",
    description: "Meals with their food items (name, serving, calories, macros) between two local dates inclusive. Max 31 days.",
    input_schema: {
      type: "object",
      properties: { start_date: { type: "string" }, end_date: { type: "string" }, meal_type: { type: ["string", "null"], enum: ["breakfast", "morning_snack", "lunch", "evening_snack", "dinner", "other", null] } },
      required: ["start_date", "end_date", "meal_type"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "get_range_stats",
    description: "Per-day totals and averages (calories, macros, activity, water) between two local dates inclusive, max 92 days. Averages are computed over days that have at least one logged meal; the day count is reported.",
    input_schema: { type: "object", properties: { start_date: { type: "string" }, end_date: { type: "string" } }, required: ["start_date", "end_date"], additionalProperties: false },
    strict: true,
  },
  {
    name: "list_activities",
    description: "Logged activities (type, start time, duration, distance, estimated calories, source) between two local dates inclusive.",
    input_schema: { type: "object", properties: { start_date: { type: "string" }, end_date: { type: "string" } }, required: ["start_date", "end_date"], additionalProperties: false },
    strict: true,
  },
];

interface Ctx { db: SupabaseClient; tz: string; profile: Record<string, unknown> }

function rangeBounds(ctx: Ctx, start: string, end: string, maxDays: number) {
  DateStr.parse(start); DateStr.parse(end);
  if (end < start) throw new Error("end_date is before start_date");
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  if (days > maxDays) throw new Error(`range too long (max ${maxDays} days)`);
  return { from: localDayBounds(start, ctx.tz).start.toISOString(), to: localDayBounds(end, ctx.tz).end.toISOString(), days };
}

async function loadRange(ctx: Ctx, start: string, end: string, maxDays: number) {
  const { from, to } = rangeBounds(ctx, start, end, maxDays);
  const [meals, acts, water] = await Promise.all([
    ctx.db.from("meal_logs").select("id,logged_at,meal_type,custom_meal_name,analysis_status,meal_items(display_name,serving_quantity,serving_unit,serving_weight_g,calories_kcal,protein_g,carbs_g,fat_g,fiber_g,sugar_g,is_approximate)")
      .gte("logged_at", from).lt("logged_at", to).order("logged_at"),
    ctx.db.from("activity_logs").select("id,activity_type,custom_name,started_at,duration_minutes,distance_m,calories_burned_kcal,source,intensity")
      .gte("started_at", from).lt("started_at", to).order("started_at"),
    ctx.db.from("water_logs").select("logged_at,volume_ml").gte("logged_at", from).lt("logged_at", to),
  ]);
  for (const r of [meals, acts, water]) if (r.error) throw r.error;
  return { meals: meals.data ?? [], acts: acts.data ?? [], water: water.data ?? [] };
}

function summarize(ctx: Ctx, date: string, data: Awaited<ReturnType<typeof loadRange>>) {
  const onDay = <T>(rows: T[], key: (r: T) => string) => rows.filter((r) => toLocalDate(key(r), ctx.tz) === date);
  return computeDailySummary({
    date,
    meals: onDay(data.meals, (m) => m.logged_at),
    activities: onDay(data.acts, (a) => a.started_at),
    waterMl: onDay(data.water, (w) => w.logged_at).map((w) => w.volume_ml),
    baseTargetKcal: Number(ctx.profile.calorie_target_kcal ?? 2000),
    budgetMethod: (ctx.profile.budget_method as BudgetMethod) ?? "base",
  });
}

async function runTool(ctx: Ctx, name: string, input: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "get_profile": {
      const p = ctx.profile;
      return {
        display_name: p.display_name, goal: p.primary_goal, units: p.preferred_units, budget_method: p.budget_method,
        targets: { calories_kcal: p.calorie_target_kcal, protein_g: p.protein_target_g, carbs_g: p.carbohydrate_target_g, fat_g: p.fat_target_g, water_ml: p.water_target_ml },
        dietary_preferences: p.dietary_preferences, allergies: p.allergies,
        clinician_guidance_recommended: Boolean(p.pregnant_or_breastfeeding),
      };
    }
    case "get_daily_summary": {
      const date = DateStr.parse(input.date);
      const s = summarize(ctx, date, await loadRange(ctx, date, date, 1));
      return s.mealCount === 0 && s.activityKcal === 0 && s.waterMl === 0 ? { ...s, note: "No records were logged on this date." } : s;
    }
    case "list_meals": {
      const data = await loadRange(ctx, String(input.start_date), String(input.end_date), 31);
      const meals = data.meals
        .filter((m) => !input.meal_type || m.meal_type === input.meal_type)
        .map((m) => ({ local_date: toLocalDate(m.logged_at, ctx.tz), local_time: new Date(m.logged_at).toLocaleTimeString("en-GB", { timeZone: ctx.tz, hour: "2-digit", minute: "2-digit" }), ...m }));
      return meals.length ? { meals } : { meals: [], note: "No meals were logged in this range." };
    }
    case "get_range_stats": {
      const start = String(input.start_date), end = String(input.end_date);
      const data = await loadRange(ctx, start, end, MAX_RANGE_DAYS);
      const days: ReturnType<typeof summarize>[] = [];
      for (let d = start; d <= end; d = addDays(d, 1)) days.push(summarize(ctx, d, data));
      const logged = days.filter((d) => d.mealCount > 0);
      const avg = (f: (d: typeof days[number]) => number) => logged.length ? Math.round(logged.reduce((a, d) => a + f(d), 0) / logged.length) : null;
      return {
        days_in_range: days.length,
        days_with_meals: logged.length,
        averages_over_logged_days: { calories: avg((d) => d.consumed.calories), protein_g: avg((d) => d.consumed.protein), carbs_g: avg((d) => d.consumed.carbs), fat_g: avg((d) => d.consumed.fat), activity_kcal: avg((d) => d.activityKcal), water_ml: avg((d) => d.waterMl) },
        per_day: days.map((d) => ({ date: d.date, calories: d.consumed.calories, protein_g: d.consumed.protein, activity_kcal: d.activityKcal, water_ml: d.waterMl, meals: d.mealCount })),
      };
    }
    case "list_activities": {
      const data = await loadRange(ctx, String(input.start_date), String(input.end_date), 31);
      return data.acts.length ? { activities: data.acts, note: "Calories are estimates." } : { activities: [], note: "No activities were logged in this range." };
    }
    default:
      throw new Error(`unknown tool ${name}`);
  }
}

Deno.serve(handler(async (req) => {
  const { user, userClient } = await authenticate(req);
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, "invalid_input", "Message must be 1–2000 characters");
  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey) throw new HttpError(503, "ai_not_configured", "The assistant isn't configured on this server yet.");
  await enforceRateLimit(adminClient(), user.id, "assistant", { perHour: 40, perDay: 150 });

  const { data: profile, error: pErr } = await userClient.from("profiles").select("*").eq("id", user.id).single();
  if (pErr || !profile) throw new HttpError(404, "no_profile", "Please finish setting up your profile first.");
  let tz = parsed.data.time_zone ?? profile.time_zone ?? "UTC";
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { tz = "UTC"; }
  const ctx: Ctx = { db: userClient, tz, profile };

  const { data: history } = await userClient.from("assistant_messages").select("role,content").order("created_at", { ascending: false }).limit(12);
  const messages: Anthropic.MessageParam[] = (history ?? []).reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  while (messages.length && messages[0].role !== "user") messages.shift();
  const today = toLocalDate(new Date(), tz);
  messages.push({ role: "user", content: `[Context: today is ${today} (${new Date().toLocaleDateString("en-US", { weekday: "long", timeZone: tz })}), time zone ${tz}]\n\n${parsed.data.message}` });

  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 });
  let answer = "";
  try {
    for (let turn = 0; turn < 8; turn++) {
      const res = await client.messages.create({
        model: env("ASSISTANT_MODEL") ?? "claude-opus-5-5",
        max_tokens: 16000,
        output_config: { effort: "low" },
        system: SYSTEM,
        tools,
        messages,
      });
      if (res.stop_reason === "refusal") { answer = "I can't help with that request. For medical concerns, please speak with a doctor or registered dietitian."; break; }
      messages.push({ role: "assistant", content: res.content });
      if (res.stop_reason !== "tool_use") {
        answer = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
        break;
      }
      const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
        res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use").map(async (b) => {
          try {
            return { type: "tool_result" as const, tool_use_id: b.id, content: JSON.stringify(await runTool(ctx, b.name, b.input as Record<string, unknown>)) };
          } catch (e) {
            return { type: "tool_result" as const, tool_use_id: b.id, is_error: true, content: e instanceof Error ? e.message : "tool failed" };
          }
        }),
      );
      messages.push({ role: "user", content: results });
    }
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "ai_rate_limited", "The assistant is busy. Please try again shortly.", 60);
    if (e instanceof Anthropic.APIError) throw new HttpError(502, "ai_unavailable", "The assistant is unavailable right now.");
    throw e;
  }
  if (!answer) answer = "Sorry — I couldn't complete that. Please try rephrasing your question.";

  await userClient.from("assistant_messages").insert([
    { user_id: user.id, role: "user", content: parsed.data.message },
    { user_id: user.id, role: "assistant", content: answer.slice(0, 8000) },
  ]);
  return json({ answer });
}));
