import { NextResponse } from "next/server";

import { isUuidLike, loadAdminInstitutionEmailIdentities } from "@/lib/admin/institutions-admin";
import { requireAllowlistedAdmin } from "@/lib/auth/admin-guard";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    institutionId: string;
  }>;
};

function parseLimit(input: string | null): number {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) return 200;
  return Math.max(1, Math.min(1000, Math.floor(parsed)));
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireAllowlistedAdmin();
  if (!auth.ok) return auth.response;

  if (!isSupabaseServiceEnvConfigured()) {
    return NextResponse.json(
      {
        error: "Institution email identities are unavailable: missing service role configuration.",
        missingEnv: getMissingSupabaseServiceEnv(),
      },
      { status: 503 }
    );
  }

  const { institutionId } = await context.params;
  if (!isUuidLike(institutionId)) {
    return NextResponse.json({ error: "Invalid institution id." }, { status: 400 });
  }

  const limit = parseLimit(new URL(request.url).searchParams.get("limit"));

  try {
    const service = createServiceClient();
    const identities = await loadAdminInstitutionEmailIdentities({
      service,
      organizationId: institutionId,
      limit,
    });

    return NextResponse.json({ identities });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to load institution email identities.",
        detail: error instanceof Error ? error.message : "Unknown institution email load error.",
      },
      { status: 500 }
    );
  }
}
