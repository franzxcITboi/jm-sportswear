// ============================================================================
// JM MAKER SPORTSWEAR — SUPABASE CLIENT INITIALIZER
// Uses ONLY the public `anon` key exposed via Vite env vars. Never loads or
// embeds a Supabase service-role key in frontend code. Falls back cleanly to
// localStorage mode when environment variables are not configured yet.
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types";

type ViteEnvMap = Record<string, string | undefined>;

function readViteEnv(key: string): string {
  const env = (import.meta as unknown as { env?: ViteEnvMap }).env;
  return (env?.[key] || "").trim();
}

const SUPABASE_URL = readViteEnv("VITE_SUPABASE_URL");
const SUPABASE_ANON_KEY = readViteEnv("VITE_SUPABASE_ANON_KEY");

const hasValidConfig =
  SUPABASE_URL.startsWith("http") &&
  SUPABASE_ANON_KEY.length > 20 &&
  !SUPABASE_URL.includes("YOUR-PROJECT-REF");

/** Strongly-typed Supabase client, or null when running in unconfigured local mode. */
export const supabase: SupabaseClient<Database> | null = hasValidConfig
  ? createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/** Returns true when VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are configured. */
export function isSupabaseConfigured(): boolean {
  return supabase !== null;
}

/** Indicates whether the app is currently backed by Supabase or browser localStorage. */
export function getDataStorageMode(): "supabase" | "frontend-local" {
  return supabase ? "supabase" : "frontend-local";
}
