import { createBrowserClient } from "@supabase/ssr";

import { requiredEnv } from "@/lib/env";

export function createClient() {
  return createBrowserClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
  );
}
