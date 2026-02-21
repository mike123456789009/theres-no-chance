import { NextResponse } from "next/server";

import { isUuidLike, mapInstitutionAdminRpcError } from "@/lib/admin/institutions-admin";
import { requireAllowlistedAdmin } from "@/lib/auth/admin-guard";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MergeBody = {
  sourceOrganizationId?: unknown;
  targetOrganizationId?: unknown;
  deleteSource?: unknown;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

export async function POST(request: Request) {
  const auth = await requireAllowlistedAdmin();
  if (!auth.ok) return auth.response;

  if (!isSupabaseServiceEnvConfigured()) {
    return NextResponse.json(
      {
        error: "Institution merge is unavailable: missing service role configuration.",
        missingEnv: getMissingSupabaseServiceEnv(),
      },
      { status: 503 }
    );
  }

  let body: MergeBody;
  try {
    body = (await request.json()) as MergeBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const sourceOrganizationId = clean(body.sourceOrganizationId);
  const targetOrganizationId = clean(body.targetOrganizationId);
  const deleteSource = parseBoolean(body.deleteSource, true);

  if (!isUuidLike(sourceOrganizationId) || !isUuidLike(targetOrganizationId)) {
    return NextResponse.json({ error: "sourceOrganizationId and targetOrganizationId must be valid UUIDs." }, { status: 400 });
  }

  if (sourceOrganizationId === targetOrganizationId) {
    return NextResponse.json({ error: "Source and target institutions must differ." }, { status: 400 });
  }

  try {
    const service = createServiceClient();
    const { data, error } = await service.rpc("admin_merge_institutions", {
      p_admin_user_id: auth.adminUser.id,
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
