import { createClient } from "@supabase/supabase-js";

import { requiredEnv } from "@/lib/env";

const REQUIRED_SUPABASE_SERVICE_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

export function getMissingSupabaseServiceEnv(): string[] {
  return REQUIRED_SUPABASE_SERVICE_ENV.filter((name) => !process.env[name]);
}

export function isSupabaseServiceEnvConfigured(): boolean {
  return getMissingSupabaseServiceEnv().length === 0;
}

export function createServiceClient() {
  return createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
