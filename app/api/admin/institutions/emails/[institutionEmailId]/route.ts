import { NextResponse } from "next/server";

import { parseAdminJsonBody, requireInstitutionAdminService, requireUuid } from "@/lib/admin/institution-route-helpers";
import { isUniqueViolation, isUuidLike } from "@/lib/admin/institutions-admin";
import { jsonError } from "@/lib/api/http-errors";
import { isEduDomain, normalizeInstitutionEmail } from "@/lib/institutions/access";
import { cleanText } from "@/lib/shared/primitives";

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

function normalizeStatus(value: unknown): "pending_verification" | "verified" | "revoked" | null {
  const normalized = cleanText(value).toLowerCase();
  if (!ALLOWED_STATUSES.has(normalized)) return null;
  return normalized as "pending_verification" | "verified" | "revoked";
}

export async function PATCH(request: Request, context: RouteContext) {
  const admin = await requireInstitutionAdminService("Institution email edits are unavailable: missing service role configuration.");
  if (!admin.ok) return admin.response;

  const { institutionEmailId } = await context.params;
  const institutionEmailUuid = requireUuid(institutionEmailId, "institution email identity id");
  if (!institutionEmailUuid.ok) return institutionEmailUuid.response;

  const parsed = await parseAdminJsonBody<EmailUpdateBody>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;

  const normalizedEmail = body.email === undefined ? undefined : normalizeInstitutionEmail(body.email);
  if (body.email !== undefined && !normalizedEmail) {
    return jsonError(400, "Institution email must be a valid email address.");
  }

  if (normalizedEmail && !isEduDomain(normalizedEmail.domain)) {
    return jsonError(400, "Institution email must use a .edu domain.");
  }

  const organizationId = body.organizationId === undefined ? undefined : cleanText(body.organizationId);
  if (organizationId !== undefined && !isUuidLike(organizationId)) {
    return jsonError(400, "organizationId must be a valid UUID.");
  }

  const status = body.status === undefined ? undefined : normalizeStatus(body.status);
  if (body.status !== undefined && !status) {
    return jsonError(400, "status must be one of pending_verification, verified, or revoked.");
  }

  if (normalizedEmail === undefined && organizationId === undefined && status === undefined) {
    return jsonError(400, "At least one field must be updated.");
  }

  try {
    const { service, adminUser } = admin.value;
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
      admin_user_id: adminUser.id,
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
