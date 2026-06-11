import type { SupabaseClient, User } from "@supabase/supabase-js";

import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";

export type AccountPageContext =
  | {
      ok: true;
      supabase: SupabaseClient;
      user: User;
    }
  | {
      ok: false;
      reason: "env";
      missingEnv: string[];
    }
  | {
      ok: false;
      reason: "auth";
    };

export async function loadAccountPageContext(): Promise<AccountPageContext> {
  if (!isSupabaseServerEnvConfigured()) {
    return {
      ok: false,
      reason: "env",
      missingEnv: getMissingSupabaseServerEnv(),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      reason: "auth",
    };
  }

  return {
    ok: true,
    supabase,
    user,
  };
}
