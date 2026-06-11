import { NextResponse } from "next/server";

import { parseAdminJsonBody, requireInstitutionAdminService, requireUuid } from "@/lib/admin/institution-route-helpers";
import { isUniqueViolation, isUuidLike, normalizeInstitutionDomain } from "@/lib/admin/institutions-admin";
import { jsonError } from "@/lib/api/http-errors";
import { cleanText, parseOptionalBoolean } from "@/lib/shared/primitives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DomainUpdateBody = {
  domain?: unknown;
  allowSubdomains?: unknown;
  organizationId?: unknown;
};

type RouteContext = {
  params: Promise<{
    domainId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const admin = await requireInstitutionAdminService("Institution domain edits are unavailable: missing service role configuration.");
  if (!admin.ok) return admin.response;

  const { domainId } = await context.params;
  const domainUuid = requireUuid(domainId, "domain id");
  if (!domainUuid.ok) return domainUuid.response;

  const parsed = await parseAdminJsonBody<DomainUpdateBody>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;

  const normalizedDomain = body.domain === undefined ? undefined : normalizeInstitutionDomain(body.domain);
  if (body.domain !== undefined && !normalizedDomain) {
    return jsonError(400, "Domain must be a valid .edu domain.");
  }

  const allowSubdomains = body.allowSubdomains === undefined ? null : parseOptionalBoolean(body.allowSubdomains);
  if (body.allowSubdomains !== undefined && allowSubdomains === null) {
    return jsonError(400, "allowSubdomains must be a boolean.");
  }

  const organizationId = body.organizationId === undefined ? undefined : cleanText(body.organizationId);
  if (organizationId !== undefined && !isUuidLike(organizationId)) {
    return jsonError(400, "organizationId must be a valid UUID.");
  }

  if (normalizedDomain === undefined && allowSubdomains === null && organizationId === undefined) {
    return jsonError(400, "At least one domain field must be updated.");
  }

  try {
    const { service, adminUser } = admin.value;
    const { data: existing, error: existingError } = await service
      .from("organization_domains")
      .select("id, organization_id, domain, allow_subdomains")
      .eq("id", domainId)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        {
          error: "Unable to load existing domain mapping.",
          detail: existingError.message,
        },
        { status: 500 }
      );
    }

    if (!existing) {
      return NextResponse.json({ error: "Domain mapping not found." }, { status: 404 });
    }

    const updatePayload: {
      domain?: string;
      allow_subdomains?: boolean;
      organization_id?: string;
    } = {};

    if (normalizedDomain !== undefined && normalizedDomain !== null) {
      updatePayload.domain = normalizedDomain;
    }

    if (allowSubdomains !== null) {
      updatePayload.allow_subdomains = allowSubdomains;
    }

    if (organizationId !== undefined) {
      updatePayload.organization_id = organizationId;
    }

    const { data: updated, error: updateError } = await service
      .from("organization_domains")
      .update(updatePayload)
      .eq("id", domainId)
      .select("id, organization_id, domain, allow_subdomains")
      .single();

    if (updateError) {
      if (isUniqueViolation(updateError)) {
        return NextResponse.json(
          {
            error: "Domain already exists on another institution mapping.",
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          error: "Unable to update domain mapping.",
          detail: updateError.message,
        },
        { status: 500 }
      );
    }

    await service.from("admin_action_log").insert({
      admin_user_id: adminUser.id,
      action: "edit_institution_domain",
      target_type: "organization_domain",
      target_id: domainId,
      details: {
        before: existing,
        after: updated,
      },
    });

    return NextResponse.json({
      message: "Domain mapping updated.",
      domain: updated,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to update domain mapping.",
        detail: error instanceof Error ? error.message : "Unknown domain update error.",
      },
      { status: 500 }
    );
  }
}
