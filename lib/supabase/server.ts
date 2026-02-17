import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { requiredEnv } from "@/lib/env";

const REQUIRED_SUPABASE_SERVER_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] as const;

export function getMissingSupabaseServerEnv(): string[] {
  return REQUIRED_SUPABASE_SERVER_ENV.filter((name) => !process.env[name]);
}

export function isSupabaseServerEnvConfigured(): boolean {
  return getMissingSupabaseServerEnv().length === 0;
}

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
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
