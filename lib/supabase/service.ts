import { createClient } from "@supabase/supabase-js";

import { requiredEnv } from "@/lib/env";
import { getMissingSupabasePublicEnvNames, resolveSupabasePublicConfigFromEnv } from "@/lib/supabase/config";

export function getMissingSupabaseServiceEnv(): string[] {
  const missing = getMissingSupabasePublicEnvNames();
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  return missing;
}

export function isSupabaseServiceEnvConfigured(): boolean {
  return getMissingSupabaseServiceEnv().length === 0;
}

export function createServiceClient() {
  const config = resolveSupabasePublicConfigFromEnv();
  if (!config) {
    const missing = getMissingSupabasePublicEnvNames().join(", ");
    throw new Error(`Missing required Supabase public env configuration: ${missing}`);
  }

  return createClient(config.url, requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
