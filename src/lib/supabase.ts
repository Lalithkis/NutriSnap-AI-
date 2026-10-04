import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isConfigured } from "./env";

export const supabase = createClient(
  isConfigured ? SUPABASE_URL : "http://localhost:54321",
  isConfigured ? SUPABASE_ANON_KEY : "missing-anon-key-placeholder-value",
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

// Refresh tokens only while the app is in the foreground (Supabase RN guidance).
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export class ApiError extends Error {
  constructor(public code: string, message: string, public status?: number) {
    super(message);
  }
}

/** Invoke an edge function and normalise its error envelope. */
export async function invokeFunction<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body: body as Record<string, unknown> });
  if (error) {
    let code = "network", message = "Couldn't reach the server. Check your connection and try again.", status: number | undefined;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      status = ctx.status;
      try {
        const j = await ctx.json();
        if (j?.error) { code = j.error.code; message = j.error.message; }
      } catch { /* non-JSON error */ }
    }
    throw new ApiError(code, message, status);
  }
  return data as T;
}
