import { NextResponse } from "next/server";

import { loadAdminInstitutionSummaries } from "@/lib/admin/institutions-admin";
import { requireAllowlistedAdmin } from "@/lib/auth/admin-guard";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAllowlistedAdmin();
  if (!auth.ok) return auth.response;

  if (!isSupabaseServiceEnvConfigured()) {
    return NextResponse.json(
      {
        error: "Institution admin is unavailable: missing service role configuration.",
        missingEnv: getMissingSupabaseServiceEnv(),
      },
      { status: 503 }
    );
  }

  try {
    const service = createServiceClient();
    const institutions = await loadAdminInstitutionSummaries(service);
    return NextResponse.json({ institutions });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to load institutions.",
        detail: error instanceof Error ? error.message : "Unknown institution admin error.",
      },
      { status: 500 }
    );
  }
}
