import { NextResponse } from "next/server";

import { isUniqueViolation, isUuidLike, normalizeInstitutionDomain } from "@/lib/admin/institutions-admin";
import { requireAllowlistedAdmin } from "@/lib/auth/admin-guard";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

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

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAllowlistedAdmin();
  if (!auth.ok) return auth.response;

  if (!isSupabaseServiceEnvConfigured()) {
    return NextResponse.json(
      {
        error: "Institution domain edits are unavailable: missing service role configuration.",
        missingEnv: getMissingSupabaseServiceEnv(),
      },
      { status: 503 }
    );
  }

  const { institutionId } = await context.params;
  if (!isUuidLike(institutionId)) {
    return NextResponse.json({ error: "Invalid institution id." }, { status: 400 });
  }

  let body: DomainCreateBody;
  try {
    body = (await request.json()) as DomainCreateBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const normalizedDomain = normalizeInstitutionDomain(body.domain);
  if (!normalizedDomain) {
    return NextResponse.json({ error: "Domain must be a valid .edu domain." }, { status: 400 });
  }

  const allowSubdomains = parseBoolean(body.allowSubdomains, true);

  try {
    const service = createServiceClient();

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
        admin_user_id: auth.adminUser.id,
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
