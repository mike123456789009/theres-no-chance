import { NextResponse } from "next/server";

import { parseAdminJsonBody, requireInstitutionAdminService, requireUuid } from "@/lib/admin/institution-route-helpers";
import { isUniqueViolation, normalizeInstitutionDomain } from "@/lib/admin/institutions-admin";
import { jsonError } from "@/lib/api/http-errors";
import { parseBoolean } from "@/lib/shared/primitives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DomainCreateBody = {
  domain?: unknown;
  allowSubdomains?: unknown;
};

type RouteContext = {
  params: Promise<{
    institutionId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const admin = await requireInstitutionAdminService("Institution domain edits are unavailable: missing service role configuration.");
  if (!admin.ok) return admin.response;

  const { institutionId } = await context.params;
  const institutionUuid = requireUuid(institutionId, "institution id");
  if (!institutionUuid.ok) return institutionUuid.response;

  const parsed = await parseAdminJsonBody<DomainCreateBody>(request);
  if (!parsed.ok) return parsed.response;

  const normalizedDomain = normalizeInstitutionDomain(parsed.value.domain);
  if (!normalizedDomain) {
    return jsonError(400, "Domain must be a valid .edu domain.");
  }

  const allowSubdomains = parseBoolean(parsed.value.allowSubdomains, true);

  try {
    const { service, adminUser } = admin.value;

    const { data, error } = await service
      .from("organization_domains")
      .insert({
        organization_id: institutionId,
        domain: normalizedDomain,
        allow_subdomains: allowSubdomains,
      })
      .select("id, organization_id, domain, allow_subdomains")
      .single();

    if (!error && data) {
      await service.from("admin_action_log").insert({
        admin_user_id: adminUser.id,
        action: "add_institution_domain",
        target_type: "organization_domain",
        target_id: data.id,
        details: {
          institutionId,
          domain: normalizedDomain,
          allowSubdomains,
        },
      });

      return NextResponse.json({
        message: "Institution domain added.",
        domain: data,
      });
    }

    if (isUniqueViolation(error)) {
      const { data: existing, error: existingError } = await service
        .from("organization_domains")
        .select("id, organization_id, domain, allow_subdomains")
        .eq("domain", normalizedDomain)
        .maybeSingle();

      if (existingError) {
        return NextResponse.json(
          {
            error: "Institution domain already exists, but existing mapping could not be loaded.",
            detail: existingError.message,
          },
          { status: 409 }
        );
      }

      if (existing?.organization_id === institutionId) {
        const { data: updated, error: updateError } = await service
          .from("organization_domains")
          .update({
            allow_subdomains: allowSubdomains,
          })
          .eq("id", existing.id)
          .select("id, organization_id, domain, allow_subdomains")
          .single();

        if (updateError || !updated) {
          return NextResponse.json(
            {
              error: "Unable to update existing domain mapping.",
              detail: updateError?.message ?? "Unknown domain update error.",
            },
            { status: 500 }
          );
        }

        return NextResponse.json({
          message: "Existing domain mapping updated.",
          domain: updated,
        });
      }

      return NextResponse.json(
        {
          error: "Domain is already mapped to another institution.",
          existingOrganizationId: existing?.organization_id ?? null,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error: "Unable to add institution domain.",
        detail: error?.message ?? "Unknown domain insert error.",
      },
      { status: 500 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to add institution domain.",
        detail: error instanceof Error ? error.message : "Unknown domain add error.",
      },
      { status: 500 }
    );
  }
}
