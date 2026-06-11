import { NextResponse } from "next/server";

import { requireInstitutionAdminService, requireUuid } from "@/lib/admin/institution-route-helpers";
import { loadAdminInstitutionEmailIdentities } from "@/lib/admin/institutions-admin";

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
  const admin = await requireInstitutionAdminService(
    "Institution email identities are unavailable: missing service role configuration."
  );
  if (!admin.ok) return admin.response;

  const { institutionId } = await context.params;
  const institutionUuid = requireUuid(institutionId, "institution id");
  if (!institutionUuid.ok) return institutionUuid.response;

  const limit = parseLimit(new URL(request.url).searchParams.get("limit"));

  try {
    const identities = await loadAdminInstitutionEmailIdentities({
      service: admin.value.service,
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
