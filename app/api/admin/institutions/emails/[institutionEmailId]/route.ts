import { NextResponse } from "next/server";

import { isUniqueViolation, isUuidLike } from "@/lib/admin/institutions-admin";
import { isEduDomain, normalizeInstitutionEmail } from "@/lib/institutions/access";
import { requireAllowlistedAdmin } from "@/lib/auth/admin-guard";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EmailUpdateBody = {
  email?: unknown;
  organizationId?: unknown;
  status?: unknown;
};

type RouteContext = {
  params: Promise<{
    institutionEmailId: string;
  }>;
};

const ALLOWED_STATUSES = new Set(["pending_verification", "verified", "revoked"]);

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStatus(value: unknown): "pending_verification" | "verified" | "revoked" | null {
  const normalized = clean(value).toLowerCase();
  if (!ALLOWED_STATUSES.has(normalized)) return null;
  return normalized as "pending_verification" | "verified" | "revoked";
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAllowlistedAdmin();
  if (!auth.ok) return auth.response;

  if (!isSupabaseServiceEnvConfigured()) {
    return NextResponse.json(
      {
        error: "Institution email edits are unavailable: missing service role configuration.",
        missingEnv: getMissingSupabaseServiceEnv(),
      },
      { status: 503 }
    );
  }

  const { institutionEmailId } = await context.params;
  if (!isUuidLike(institutionEmailId)) {
    return NextResponse.json({ error: "Invalid institution email identity id." }, { status: 400 });
  }

  let body: EmailUpdateBody;
  try {
    body = (await request.json()) as EmailUpdateBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const normalizedEmail = body.email === undefined ? undefined : normalizeInstitutionEmail(body.email);
  if (body.email !== undefined && !normalizedEmail) {
    return NextResponse.json({ error: "Institution email must be a valid email address." }, { status: 400 });
  }

  if (normalizedEmail && !isEduDomain(normalizedEmail.domain)) {
    return NextResponse.json({ error: "Institution email must use a .edu domain." }, { status: 400 });
  }

  const organizationId = body.organizationId === undefined ? undefined : clean(body.organizationId);
  if (organizationId !== undefined && !isUuidLike(organizationId)) {
    return NextResponse.json({ error: "organizationId must be a valid UUID." }, { status: 400 });
  }

  const status = body.status === undefined ? undefined : normalizeStatus(body.status);
  if (body.status !== undefined && !status) {
    return NextResponse.json(
      {
        error: "status must be one of pending_verification, verified, or revoked.",
      },
      { status: 400 }
    );
  }

  if (normalizedEmail === undefined && organizationId === undefined && status === undefined) {
    return NextResponse.json({ error: "At least one field must be updated." }, { status: 400 });
  }

  try {
    const service = createServiceClient();
    const { data: existing, error: existingError } = await service
      .from("user_institution_emails")
      .select("id, email, domain, organization_id, status, verified_at")
      .eq("id", institutionEmailId)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        {
          error: "Unable to load institution email identity.",
          detail: existingError.message,
        },
        { status: 500 }
      );
    }

    if (!existing) {
      return NextResponse.json({ error: "Institution email identity not found." }, { status: 404 });
    }

    const updatePayload: {
      email?: string;
      domain?: string;
      organization_id?: string;
      status?: "pending_verification" | "verified" | "revoked";
      verified_at?: string | null;
    } = {};

    if (normalizedEmail) {
      updatePayload.email = normalizedEmail.email;
      updatePayload.domain = normalizedEmail.domain;
    }

    if (organizationId !== undefined) {
      updatePayload.organization_id = organizationId;
    }

    if (status !== undefined && status !== null) {
      updatePayload.status = status;

      if (status === "verified") {
        updatePayload.verified_at = existing.verified_at ?? new Date().toISOString();
      } else if (status === "pending_verification") {
        updatePayload.verified_at = null;
      }
    }

    const { data: updated, error: updateError } = await service
      .from("user_institution_emails")
      .update(updatePayload)
      .eq("id", institutionEmailId)
      .select("id, user_id, email, domain, organization_id, status, verified_at, created_at, updated_at")
      .single();

    if (updateError) {
      if (isUniqueViolation(updateError)) {
        return NextResponse.json(
          {
            error: "Institution email is already mapped to another account.",
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          error: "Unable to update institution email identity.",
          detail: updateError.message,
        },
        { status: 500 }
      );
    }

    await service.from("admin_action_log").insert({
      admin_user_id: auth.adminUser.id,
      action: "edit_institution_email_identity",
      target_type: "institution_email_identity",
      target_id: institutionEmailId,
      details: {
        before: existing,
        after: updated,
      },
    });

    return NextResponse.json({
      message: "Institution email identity updated.",
      identity: updated,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to update institution email identity.",
        detail: error instanceof Error ? error.message : "Unknown institution email update error.",
      },
      { status: 500 }
    );
  }
}
