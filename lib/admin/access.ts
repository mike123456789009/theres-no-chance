import { checkUserAdminAccess, getAdminAllowlistEmails } from "@/lib/auth/admin";
import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";
import { getMissingSupabaseServiceEnv } from "@/lib/supabase/service";

export type AdminPageAccessResult =
  | {
      ok: true;
      adminUser: {
        id: string;
        email: string | null;
      };
      allowlist: string[];
    }
  | {
      ok: false;
      reason: "missing_server_env" | "unauthenticated" | "forbidden" | "missing_service_env";
      email?: string | null;
      allowlist?: string[];
      missingEnv?: string[];
    };

export async function guardAdminPageAccess(): Promise<AdminPageAccessResult> {
  if (!isSupabaseServerEnvConfigured()) {
    return {
      ok: false,
      reason: "missing_server_env",
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
      reason: "unauthenticated",
    };
  }

  const email = user.email?.toLowerCase() ?? null;
  const allowlist = getAdminAllowlistEmails();
  const adminAccess = await checkUserAdminAccess({
    userId: user.id,
    email: user.email,
  });

  if (adminAccess.roleCheckUnavailable && !adminAccess.isAdmin) {
    return {
      ok: false,
      reason: "missing_service_env",
      email,
      allowlist,
      missingEnv: getMissingSupabaseServiceEnv(),
    };
  }

  if (!adminAccess.isAdmin) {
    return {
      ok: false,
      reason: "forbidden",
      email,
      allowlist,
    };
  }

  return {
    ok: true,
    adminUser: {
      id: user.id,
      email: user.email ?? null,
    },
    allowlist,
  };
}
