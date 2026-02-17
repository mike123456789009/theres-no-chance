import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getMissingSupabasePublicEnvNames, resolveSupabasePublicConfigFromEnv } from "@/lib/supabase/config";

export function getMissingSupabaseServerEnv(): string[] {
  return getMissingSupabasePublicEnvNames();
}

export function isSupabaseServerEnvConfigured(): boolean {
  return getMissingSupabaseServerEnv().length === 0;
}

export async function createClient() {
  const cookieStore = await cookies();
  const config = resolveSupabasePublicConfigFromEnv();

  if (!config) {
    const missing = getMissingSupabaseServerEnv().join(", ");
    throw new Error(`Missing required Supabase public env configuration: ${missing}`);
  }

  return createServerClient(
    config.url,
    config.publishableKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}
