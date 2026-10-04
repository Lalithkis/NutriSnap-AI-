import type { AnalysisResult } from "@/api/types";
import { ApiError, invokeFunction } from "./supabase";

const RETRYABLE = new Set(["network", "ai_timeout", "ai_unavailable", "internal"]);

/** Call analyze-meal with one automatic retry for transient failures (same idempotency key). */
export async function analyzeMeal(args: { image_path: string; client_request_id: string; meal_type?: string }): Promise<AnalysisResult> {
  try {
    return await invokeFunction<AnalysisResult>("analyze-meal", args);
  } catch (e) {
    if (e instanceof ApiError && RETRYABLE.has(e.code)) {
      await new Promise((r) => setTimeout(r, 1500));
      return invokeFunction<AnalysisResult>("analyze-meal", args);
    }
    throw e;
  }
}
