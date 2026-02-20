import { createServiceClient, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

const BOOTSTRAP_ADMIN_EMAILS = ["callowmichaelt@gmail.com"] as const;

type UserRoleRow = {
  user_id: string;
};

function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];

  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value, index, all) => value.length > 0 && all.indexOf(value) === index);
}

export function getAdminAllowlistEmails(): string[] {
  const configured = parseAllowlist(process.env.ADMIN_ALLOWLIST_EMAILS);
  const merged = [...configured, ...BOOTSTRAP_ADMIN_EMAILS];
  return merged.filter((value, index, all) => value.length > 0 && all.indexOf(value) === index);
}

export function isEmailAllowlisted(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowlist = getAdminAllowlistEmails();
  return allowlist.includes(email.toLowerCase());
}

export function isAdminAllowlistConfigured(): boolean {
  return getAdminAllowlistEmails().length > 0;
}

export type AdminAccessCheckResult = {
  isAdmin: boolean;
  source: "bootstrap_email" | "role" | "none";
  roleCheckUnavailable: boolean;
  errorMessage: string;
};

export async function listPlatformAdminUserIds(limit = 400): Promise<string[]> {
  if (!isSupabaseServiceEnvConfigured()) return [];

  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("user_roles")
      .select("user_id")
      .eq("role", "platform_admin")
      .is("organization_id", null)
      .limit(limit);

    if (error) return [];
    return ((data ?? []) as UserRoleRow[]).map((row) => row.user_id).filter((value) => value.length > 0);
  } catch {
    return [];
  }
}

export async function checkUserAdminAccess(input: {
  userId: string;
  email: string | null | undefined;
}): Promise<AdminAccessCheckResult> {
  if (isEmailAllowlisted(input.email)) {
    return {
      isAdmin: true,
      source: "bootstrap_email",
      roleCheckUnavailable: false,
      errorMessage: "",
    };
  }

  if (!isSupabaseServiceEnvConfigured()) {
    return {
      isAdmin: false,
      source: "none",
      roleCheckUnavailable: true,
      errorMessage: "Supabase service-role environment is not configured for role checks.",
    };
  }

  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("user_roles")
      .select("user_id")
      .eq("user_id", input.userId)
      .eq("role", "platform_admin")
      .is("organization_id", null)
      .maybeSingle();

    if (error) {
      return {
        isAdmin: false,
        source: "none",
        roleCheckUnavailable: true,
        errorMessage: error.message,
      };
    }

    return {
      isAdmin: Boolean((data as UserRoleRow | null)?.user_id),
      source: (data as UserRoleRow | null)?.user_id ? "role" : "none",
      roleCheckUnavailable: false,
      errorMessage: "",
    };
  } catch (error) {
    return {
      isAdmin: false,
      source: "none",
      roleCheckUnavailable: true,
      errorMessage: error instanceof Error ? error.message : "Unknown role-check failure.",
    };
  }
}
