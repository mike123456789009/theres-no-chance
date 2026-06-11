import { NextResponse } from "next/server";

import { parseAdminJsonBody, requireInstitutionAdminService, requireUuid } from "@/lib/admin/institution-route-helpers";
import { jsonError } from "@/lib/api/http-errors";
import { cleanText } from "@/lib/shared/primitives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RenameBody = {
  name?: unknown;
};

type RouteContext = {
  params: Promise<{
    institutionId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const admin = await requireInstitutionAdminService("Institution edit is unavailable: missing service role configuration.");
  if (!admin.ok) return admin.response;

  const { institutionId } = await context.params;
  const institutionUuid = requireUuid(institutionId, "institution id");
  if (!institutionUuid.ok) return institutionUuid.response;

  const parsed = await parseAdminJsonBody<RenameBody>(request);
  if (!parsed.ok) return parsed.response;

  const name = cleanText(parsed.value.name).replace(/\s+/g, " ").slice(0, 120);
  if (name.length < 2) {
    return jsonError(400, "Institution name must be at least 2 characters.");
  }

  try {
    const { service, adminUser } = admin.value;
    const { data, error } = await service
      .from("organizations")
      .update({
        name,
      })
      .eq("id", institutionId)
      .select("id, name, slug")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Institution not found." }, { status: 404 });
      }

      return NextResponse.json(
        {
          error: "Unable to rename institution.",
          detail: error.message,
        },
        { status: 500 }
      );
    }

    await service.from("admin_action_log").insert({
      admin_user_id: adminUser.id,
      action: "rename_institution",
      target_type: "organization",
      target_id: institutionId,
      details: {
        institutionId,
        updatedName: name,
      },
    });

    return NextResponse.json({
      message: "Institution renamed.",
      institution: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to rename institution.",
        detail: error instanceof Error ? error.message : "Unknown institution rename error.",
      },
      { status: 500 }
    );
  }
}
