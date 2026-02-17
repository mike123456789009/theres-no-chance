import { NextResponse } from "next/server";

import { isAdminAllowlistConfigured, isEmailAllowlisted } from "@/lib/auth/admin";
import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";

export async function GET() {
  if (!isSupabaseServerEnvConfigured()) {
    const missingEnv = getMissingSupabaseServerEnv();

    return NextResponse.json(
      {
        error: "Admin session unavailable: missing Supabase environment variables.",
        missingEnv,
        allowlistConfigured: isAdminAllowlistConfigured(),
      },
      { status: 503 }
    );
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      email: user.email ?? null,
      isAdmin: isEmailAllowlisted(user.email),
      allowlistConfigured: isAdminAllowlistConfigured(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Admin session check failed.",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 503 }
    );
  }
}
