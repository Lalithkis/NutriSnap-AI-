// Request/response helpers for Supabase Edge Functions (Deno).
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfterS?: number) {
    super(message);
  }
}

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) {
    const extra: Record<string, string> = e.retryAfterS ? { "Retry-After": String(e.retryAfterS) } : {};
    return json({ error: { code: e.code, message: e.message } }, e.status, extra);
  }
  // Never echo internal error details (could contain user data) to the client.
  console.error("unhandled_error", e instanceof Error ? e.name + ": " + e.message : "unknown");
  return json({ error: { code: "internal", message: "Something went wrong. Please try again." } }, 500);
}

export function env(name: string): string | undefined {
  const v = Deno.env.get(name);
  return v && v.length > 0 ? v : undefined;
}

export function requireEnv(name: string): string {
  const v = env(name);
  if (!v) throw new HttpError(503, "not_configured", `Server is missing configuration: ${name}`);
  return v;
}

export function adminClient(): SupabaseClient {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Authenticate the caller from the Authorization header. Returns a user-scoped client (RLS applies). */
export async function authenticate(req: Request): Promise<{ user: User; userClient: SupabaseClient }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new HttpError(401, "unauthorized", "Sign in required");
  const userClient = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.auth.getUser(authHeader.slice(7));
  if (error || !data.user) throw new HttpError(401, "unauthorized", "Session expired. Please sign in again.");
  return { user: data.user, userClient };
}

export async function readJson<T>(req: Request, maxBytes = 64_000): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "payload_too_large", "Request is too large");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "bad_json", "Request body must be JSON");
  }
}

export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: { code: "method_not_allowed", message: "POST only" } }, 405);
    try {
      return await fn(req);
    } catch (e) {
      return errorResponse(e);
    }
  };
}
