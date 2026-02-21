import { NextResponse } from "next/server";

import { isUuidLike } from "@/lib/admin/institutions-admin";
import { requireAllowlistedAdmin } from "@/lib/auth/admin-guard";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

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

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAllowlistedAdmin();
  if (!auth.ok) return auth.response;

  if (!isSupabaseServiceEnvConfigured()) {
    return NextResponse.json(
      {
        error: "Institution edit is unavailable: missing service role configuration.",
        missingEnv: getMissingSupabaseServiceEnv(),
      },
      { status: 503 }
    );
  }

  const { institutionId } = await context.params;
  if (!isUuidLike(institutionId)) {
    return NextResponse.json({ error: "Invalid institution id." }, { status: 400 });
  }

  let body: RenameBody;
  try {
    body = (await request.json()) as RenameBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const name = clean(body.name).replace(/\s+/g, " ").slice(0, 120);
  if (name.length < 2) {
    return NextResponse.json({ error: "Institution name must be at least 2 characters." }, { status: 400 });
  }

  try {
    const service = createServiceClient();
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
      admin_user_id: auth.adminUser.id,
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
