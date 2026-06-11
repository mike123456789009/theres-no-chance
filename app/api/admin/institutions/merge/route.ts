import { NextResponse } from "next/server";

import { parseAdminJsonBody, requireInstitutionAdminService } from "@/lib/admin/institution-route-helpers";
import { isUuidLike, mapInstitutionAdminRpcError } from "@/lib/admin/institutions-admin";
import { jsonError } from "@/lib/api/http-errors";
import { cleanText, parseBoolean } from "@/lib/shared/primitives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MergeBody = {
  sourceOrganizationId?: unknown;
  targetOrganizationId?: unknown;
  deleteSource?: unknown;
};

export async function POST(request: Request) {
  const admin = await requireInstitutionAdminService("Institution merge is unavailable: missing service role configuration.");
  if (!admin.ok) return admin.response;

  const parsed = await parseAdminJsonBody<MergeBody>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;

  const sourceOrganizationId = cleanText(body.sourceOrganizationId);
  const targetOrganizationId = cleanText(body.targetOrganizationId);
  const deleteSource = parseBoolean(body.deleteSource, true);

  if (!isUuidLike(sourceOrganizationId) || !isUuidLike(targetOrganizationId)) {
    return jsonError(400, "sourceOrganizationId and targetOrganizationId must be valid UUIDs.");
  }

  if (sourceOrganizationId === targetOrganizationId) {
    return jsonError(400, "Source and target institutions must differ.");
  }

  try {
    const { service, adminUser } = admin.value;
    const { data, error } = await service.rpc("admin_merge_institutions", {
      p_admin_user_id: adminUser.id,
      p_source_organization_id: sourceOrganizationId,
      p_target_organization_id: targetOrganizationId,
      p_delete_source: deleteSource,
    });

    if (error) {
      const mapped = mapInstitutionAdminRpcError(error.message);
      return NextResponse.json(
        {
          error: mapped.error,
          detail: mapped.detail,
        },
        { status: mapped.status }
      );
    }

    return NextResponse.json({
      message: "Institution merge completed.",
      result: data ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to merge institutions.",
        detail: error instanceof Error ? error.message : "Unknown institution merge error.",
      },
      { status: 500 }
    );
  }
}
