import { NextResponse } from "next/server";

import { isUniqueViolation, isUuidLike, normalizeInstitutionDomain } from "@/lib/admin/institutions-admin";
import { requireAllowlistedAdmin } from "@/lib/auth/admin-guard";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

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

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return null;
}

export async function PATCH(request: Request, context: RouteContext) {
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

  const { domainId } = await context.params;
  if (!isUuidLike(domainId)) {
    return NextResponse.json({ error: "Invalid domain id." }, { status: 400 });
  }

  let body: DomainUpdateBody;
  try {
    body = (await request.json()) as DomainUpdateBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const normalizedDomain = body.domain === undefined ? undefined : normalizeInstitutionDomain(body.domain);
  if (body.domain !== undefined && !normalizedDomain) {
    return NextResponse.json({ error: "Domain must be a valid .edu domain." }, { status: 400 });
  }

  const allowSubdomains = body.allowSubdomains === undefined ? null : parseBoolean(body.allowSubdomains);
  if (body.allowSubdomains !== undefined && allowSubdomains === null) {
    return NextResponse.json({ error: "allowSubdomains must be a boolean." }, { status: 400 });
  }

  const organizationId = body.organizationId === undefined ? undefined : clean(body.organizationId);
  if (organizationId !== undefined && !isUuidLike(organizationId)) {
    return NextResponse.json({ error: "organizationId must be a valid UUID." }, { status: 400 });
  }

  if (normalizedDomain === undefined && allowSubdomains === null && organizationId === undefined) {
    return NextResponse.json({ error: "At least one domain field must be updated." }, { status: 400 });
  }

  try {
    const service = createServiceClient();
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
      admin_user_id: auth.adminUser.id,
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
