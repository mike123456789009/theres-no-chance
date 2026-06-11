import { NextResponse } from "next/server";

import { requireInstitutionAdminService } from "@/lib/admin/institution-route-helpers";
import { loadAdminInstitutionSummaries } from "@/lib/admin/institutions-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const context = await requireInstitutionAdminService("Institution admin is unavailable: missing service role configuration.");
  if (!context.ok) return context.response;

  try {
    const institutions = await loadAdminInstitutionSummaries(context.value.service);
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
