import {
  collectInstitutionDomainCandidates,
  generateInstitutionSlugCandidates,
  isLikelyUuid,
  normalizeInstitutionName,
  resolveInstitutionCandidate,
  type InstitutionDomainCandidate,
  type InstitutionOrganization,
} from "@/lib/institutions/access";
import { isUniqueViolation } from "@/lib/institutions/errors";
import { createServiceClient } from "@/lib/supabase/service";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

export function extractOrganization(value: unknown): InstitutionOrganization | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = clean(row.id);
  const name = clean(row.name);
  const slug = clean(row.slug);
  if (!id || !name || !slug) return null;
  return { id, name, slug };
}

export type OrganizationDomainRow = {
  organization_id: string;
  domain: string;
  allow_subdomains: boolean;
  organizations:
    | {
        id?: string;
        name?: string;
        slug?: string;
      }
    | Array<{
        id?: string;
        name?: string;
        slug?: string;
      }>
    | null;
};

export type ResolveOrganizationForDomainResult =
  | {
      kind: "resolved";
      organization: InstitutionOrganization;
      candidates: InstitutionDomainCandidate[];
      createdOrganization: boolean;
    }
  | {
      kind: "ambiguous";
      candidates: InstitutionDomainCandidate[];
    }
  | {
      kind: "no_match";
      candidates: InstitutionDomainCandidate[];
    };

async function listOrganizationDomainRows(): Promise<OrganizationDomainRow[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("organization_domains")
    .select("organization_id, domain, allow_subdomains, organizations(id, name, slug)")
    .limit(5000);

  if (error) {
    throw new Error(`Unable to load organization domain rows: ${error.message}`);
  }

  return (data ?? []) as OrganizationDomainRow[];
}

export async function getOrganizationById(organizationId: string): Promise<InstitutionOrganization | null> {
  if (!isLikelyUuid(organizationId)) return null;
  const service = createServiceClient();
  const { data, error } = await service
    .from("organizations")
    .select("id, name, slug")
    .eq("id", organizationId)
    .maybeSingle();

  if (error) return null;
  return extractOrganization(data);
}

async function createOrganizationWithDomain(input: {
  domain: string;
  institutionName: string;
  createdBy: string;
}): Promise<{ organization: InstitutionOrganization; createdOrganization: boolean }> {
  const service = createServiceClient();
  const slugSeeds = generateInstitutionSlugCandidates(input.institutionName, input.domain);

  let createdOrg: InstitutionOrganization | null = null;

  for (const seed of slugSeeds) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const candidateSlug =
        attempt === 0 ? seed : `${seed}-${attempt + 1}`.slice(0, 64).replace(/-+/g, "-").replace(/^-|-$/g, "");

      const { data, error } = await service
        .from("organizations")
        .insert({
          name: input.institutionName,
          slug: candidateSlug,
          created_by: input.createdBy,
        })
        .select("id, name, slug")
        .single();

      if (!error && data) {
        createdOrg = extractOrganization(data);
        break;
      }

      if (!isUniqueViolation(error)) {
        throw new Error(`Unable to create institution organization: ${error?.message ?? "Unknown error"}`);
      }
    }

    if (createdOrg) break;
  }

  if (!createdOrg) {
    throw new Error("Unable to generate a unique institution slug.");
  }

  const { error: domainInsertError } = await service.from("organization_domains").insert({
    organization_id: createdOrg.id,
    domain: input.domain,
    allow_subdomains: true,
  });

  if (!domainInsertError) {
    return {
      organization: createdOrg,
      createdOrganization: true,
    };
  }

  if (!isUniqueViolation(domainInsertError)) {
    throw new Error(`Unable to create institution domain mapping: ${domainInsertError.message}`);
  }

  const { data: existingDomain } = await service
    .from("organization_domains")
    .select("organization_id, organizations(id, name, slug)")
    .eq("domain", input.domain)
    .maybeSingle();

  const existingOrg = extractOrganization(
    Array.isArray((existingDomain as Record<string, unknown> | null)?.organizations)
      ? asArray((existingDomain as Record<string, unknown>).organizations)[0]
      : (existingDomain as Record<string, unknown> | null)?.organizations
  );

  if (existingOrg) {
    await service.from("organizations").delete().eq("id", createdOrg.id);
    return {
      organization: existingOrg,
      createdOrganization: false,
    };
  }

  throw new Error("Institution domain already exists but organization could not be resolved.");
}

export async function resolveOrganizationForDomain(input: {
  domain: string;
  selectedOrganizationId?: string;
  newInstitutionName?: string;
  createdBy: string;
}): Promise<ResolveOrganizationForDomainResult> {
  const rows = await listOrganizationDomainRows();
  const candidates = collectInstitutionDomainCandidates({
    emailDomain: input.domain,
    rows,
  });

  const resolved = resolveInstitutionCandidate({
    candidates,
    selectedOrganizationId: input.selectedOrganizationId,
  });

  if (resolved.kind === "resolved") {
    return {
      kind: "resolved",
      organization: resolved.organization,
      candidates: resolved.candidates,
      createdOrganization: false,
    };
  }

  if (resolved.kind === "ambiguous") {
    return {
      kind: "ambiguous",
      candidates: resolved.candidates,
    };
  }

  const institutionName = normalizeInstitutionName(input.newInstitutionName);
  if (!institutionName) {
    return {
      kind: "no_match",
      candidates: resolved.candidates,
    };
  }

  const created = await createOrganizationWithDomain({
    domain: input.domain,
    institutionName,
    createdBy: input.createdBy,
  });

  return {
    kind: "resolved",
    organization: created.organization,
    candidates,
    createdOrganization: created.createdOrganization,
  };
}
