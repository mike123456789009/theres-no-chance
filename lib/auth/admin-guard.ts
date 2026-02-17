import { NextResponse } from "next/server";

import { isAdminAllowlistConfigured, isEmailAllowlisted } from "@/lib/auth/admin";
import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";

type AdminAuthResult =
  | {
      ok: true;
      adminUser: {
        id: string;
        email: string | null;
      };
    }
  | {
      ok: false;
      response: NextResponse;
    };

export async function requireAllowlistedAdmin(): Promise<AdminAuthResult> {
  if (!isSupabaseServerEnvConfigured()) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Admin auth unavailable: missing Supabase environment variables.",
          missingEnv: getMissingSupabaseServerEnv(),
        },
        { status: 503 }
      ),
    };
  }

  if (!isAdminAllowlistConfigured()) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "Admin allowlist is not configured.",
        },
        { status: 503 }
      ),
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
      response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  if (!isEmailAllowlisted(user.email)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    };
  }

  return {
    ok: true,
    adminUser: {
      id: user.id,
      email: user.email ?? null,
    },
  };
}
