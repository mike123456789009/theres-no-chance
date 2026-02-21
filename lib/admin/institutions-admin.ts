import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminInstitutionDomainSummary = {
  id: string;
  organizationId: string;
  domain: string;
  allowSubdomains: boolean;
};

export type AdminInstitutionSummary = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  domains: AdminInstitutionDomainSummary[];
  counts: {
    activeMembers: number;
    totalMembers: number;
    verifiedEmails: number;
    pendingEmails: number;
  };
};

export type AdminInstitutionEmailIdentity = {
  id: string;
  userId: string;
  email: string;
  domain: string;
  organizationId: string;
  status: "pending_verification" | "verified" | "revoked";
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ServiceClient = SupabaseClient;

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
};

type OrganizationDomainRow = {
  id: string;
  organization_id: string;
  domain: string;
  allow_subdomains: boolean;
};

type MembershipRow = {
  organization_id: string;
  status: string;
};

type InstitutionEmailCountRow = {
  organization_id: string;
  status: string;
};

type InstitutionEmailRow = {
  id: string;
  user_id: string;
  email: string;
  domain: string;
  organization_id: string;
  status: "pending_verification" | "verified" | "revoked";
  verified_at: string | null;
  created_at: string;
  updated_at: string;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function normalizeInstitutionDomain(value: unknown): string | null {
  const normalized = clean(value).toLowerCase();
  if (!normalized) return null;
  if (normalized.length > 255) return null;
  if (!/^[a-z0-9.-]+$/.test(normalized)) return null;
  if (!normalized.includes(".")) return null;
  if (normalized.startsWith(".") || normalized.endsWith(".")) return null;
  if (normalized.includes("..")) return null;
  if (!normalized.endsWith(".edu")) return null;

  return normalized;
}

export function isUniqueViolation(error: { code?: string; message?: string } | null | undefined): boolean {
  return error?.code === "23505" || clean(error?.message).toLowerCase().includes("duplicate key");
}

export function mapInstitutionAdminRpcError(message: string): { status: number; error: string; detail: string } {
  const trimmed = clean(message);
  const match = trimmed.match(/^\[(INST_[A-Z_]+)\]\s*(.*)$/);

  if (!match) {
    return {
      status: 500,
      error: "Institution admin action failed.",
      detail: trimmed || "Unknown institution admin error.",
    };
  }

  const code = match[1];
  const detail = clean(match[2]) || "Institution admin action failed.";

  if (code === "INST_VALIDATION") {
    return {
      status: 400,
      error: "Institution admin validation failed.",
      detail,
    };
  }

  if (code === "INST_FORBIDDEN") {
    return {
      status: 403,
      error: "Institution admin action forbidden.",
      detail,
    };
  }

  if (code === "INST_NOT_FOUND") {
    return {
      status: 404,
      error: "Institution not found.",
      detail,
    };
  }

  return {
    status: 500,
    error: "Institution admin action failed.",
    detail,
  };
}

export async function loadAdminInstitutionSummaries(service: ServiceClient): Promise<AdminInstitutionSummary[]> {
  const [organizationsResult, domainsResult, membershipsResult, emailCountsResult] = await Promise.all([
    service.from("organizations").select("id, name, slug, created_at").order("name", { ascending: true }).limit(5000),
    service
      .from("organization_domains")
      .select("id, organization_id, domain, allow_subdomains")
      .order("domain", { ascending: true })
      .limit(10000),
    service.from("organization_memberships").select("organization_id, status").limit(100000),
    service.from("user_institution_emails").select("organization_id, status").limit(100000),
  ]);

  if (organizationsResult.error) {
    throw new Error(`Unable to load institutions: ${organizationsResult.error.message}`);
  }

  if (domainsResult.error) {
    throw new Error(`Unable to load institution domains: ${domainsResult.error.message}`);
  }

  if (membershipsResult.error) {
    throw new Error(`Unable to load institution memberships: ${membershipsResult.error.message}`);
  }

  if (emailCountsResult.error) {
    throw new Error(`Unable to load institution email identities: ${emailCountsResult.error.message}`);
  }

  const domainsByOrganization = new Map<string, AdminInstitutionDomainSummary[]>();
  for (const row of (domainsResult.data ?? []) as OrganizationDomainRow[]) {
    const organizationId = clean(row.organization_id);
    if (!organizationId) continue;

    const current = domainsByOrganization.get(organizationId) ?? [];
    current.push({
      id: row.id,
      organizationId,
      domain: row.domain,
      allowSubdomains: row.allow_subdomains !== false,
    });
    domainsByOrganization.set(organizationId, current);
  }

  const membershipCountsByOrganization = new Map<
    string,
    {
      totalMembers: number;
      activeMembers: number;
    }
  >();

  for (const row of (membershipsResult.data ?? []) as MembershipRow[]) {
    const organizationId = clean(row.organization_id);
    if (!organizationId) continue;

    const current = membershipCountsByOrganization.get(organizationId) ?? {
      totalMembers: 0,
      activeMembers: 0,
    };
    current.totalMembers += 1;
    if (clean(row.status).toLowerCase() === "active") {
      current.activeMembers += 1;
    }
    membershipCountsByOrganization.set(organizationId, current);
  }

  const emailCountsByOrganization = new Map<
    string,
    {
      verifiedEmails: number;
      pendingEmails: number;
    }
  >();

  for (const row of (emailCountsResult.data ?? []) as InstitutionEmailCountRow[]) {
    const organizationId = clean(row.organization_id);
    if (!organizationId) continue;

    const current = emailCountsByOrganization.get(organizationId) ?? {
      verifiedEmails: 0,
      pendingEmails: 0,
    };

    const status = clean(row.status).toLowerCase();
    if (status === "verified") {
      current.verifiedEmails += 1;
    } else if (status === "pending_verification") {
      current.pendingEmails += 1;
    }

    emailCountsByOrganization.set(organizationId, current);
  }

  const institutions: AdminInstitutionSummary[] = ((organizationsResult.data ?? []) as OrganizationRow[]).map((row) => {
    const membershipCounts = membershipCountsByOrganization.get(row.id) ?? {
      totalMembers: 0,
      activeMembers: 0,
    };
    const emailCounts = emailCountsByOrganization.get(row.id) ?? {
      verifiedEmails: 0,
      pendingEmails: 0,
    };

    const domains = (domainsByOrganization.get(row.id) ?? []).sort((a, b) =>
      a.domain.localeCompare(b.domain, "en", { sensitivity: "base" })
    );

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      createdAt: row.created_at,
      domains,
      counts: {
        activeMembers: membershipCounts.activeMembers,
        totalMembers: membershipCounts.totalMembers,
        verifiedEmails: emailCounts.verifiedEmails,
        pendingEmails: emailCounts.pendingEmails,
      },
    };
  });

  return institutions;
}

export async function loadAdminInstitutionEmailIdentities(input: {
  service: ServiceClient;
  organizationId: string;
  limit: number;
}): Promise<AdminInstitutionEmailIdentity[]> {
  const { data, error } = await input.service
    .from("user_institution_emails")
    .select("id, user_id, email, domain, organization_id, status, verified_at, created_at, updated_at")
    .eq("organization_id", input.organizationId)
    .order("updated_at", { ascending: false })
    .limit(input.limit);

  if (error) {
    throw new Error(`Unable to load institution email identities: ${error.message}`);
  }

  return ((data ?? []) as InstitutionEmailRow[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    email: row.email,
    domain: row.domain,
    organizationId: row.organization_id,
    status: row.status,
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
