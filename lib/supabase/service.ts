import { createClient } from "@supabase/supabase-js";

import { requiredEnv } from "@/lib/env";
import { getMissingSupabaseUrlEnvNames, resolveSupabaseUrlFromEnv } from "@/lib/supabase/config";

export function getMissingSupabaseServiceEnv(): string[] {
  const missing = getMissingSupabaseUrlEnvNames();
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  return missing;
}

export function isSupabaseServiceEnvConfigured(): boolean {
  return getMissingSupabaseServiceEnv().length === 0;
}

export function createServiceClient() {
  const supabaseUrl = resolveSupabaseUrlFromEnv();
  if (!supabaseUrl) {
    const missing = getMissingSupabaseUrlEnvNames().join(", ");
    throw new Error(`Missing required Supabase URL env configuration: ${missing}`);
  }

  return createClient(supabaseUrl, requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
