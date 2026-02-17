export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
};

function clean(value: string | undefined): string {
  if (typeof value !== "string") return "";

  return value
    .replace(/\\r\\n/g, "")
    .replace(/\\n/g, "")
    .replace(/\\r/g, "")
    .trim();
}

export function resolveSupabasePublicConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SupabasePublicConfig | null {
  const url = resolveSupabaseUrlFromEnv(env);
  const publishableKey =
    clean(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) || clean(env.SUPABASE_PUBLISHABLE_KEY);

  if (!url || !publishableKey) {
    return null;
  }

  return {
    url,
    publishableKey,
  };
}

export function resolveSupabaseUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return clean(env.NEXT_PUBLIC_SUPABASE_URL) || clean(env.SUPABASE_URL);
}

export function getMissingSupabaseUrlEnvNames(env: NodeJS.ProcessEnv = process.env): string[] {
  if (!resolveSupabaseUrlFromEnv(env)) {
    return ["NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL"];
  }
  return [];
}

export function getMissingSupabasePublicEnvNames(env: NodeJS.ProcessEnv = process.env): string[] {
  const missing: string[] = [];

  if (!clean(env.NEXT_PUBLIC_SUPABASE_URL) && !clean(env.SUPABASE_URL)) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL");
  }

  if (!clean(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) && !clean(env.SUPABASE_PUBLISHABLE_KEY)) {
    missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or SUPABASE_PUBLISHABLE_KEY");
  }

  return missing;
}
