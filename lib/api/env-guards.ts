import { getMissingSupabaseServerEnv } from "@/lib/supabase/server";
import { getMissingSupabaseServiceEnv } from "@/lib/supabase/service";

export type EnvReadiness = Readonly<{
  isConfigured: boolean;
  missingEnv: string[];
}>;

function buildEnvReadiness(missingEnv: string[]): EnvReadiness {
  return {
    isConfigured: missingEnv.length === 0,
    missingEnv,
  };
}

export function getServerEnvReadiness(): EnvReadiness {
  return buildEnvReadiness(getMissingSupabaseServerEnv());
}

export function getServiceEnvReadiness(): EnvReadiness {
  return buildEnvReadiness(getMissingSupabaseServiceEnv());
}
