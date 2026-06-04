import crypto from "node:crypto";

import {
  INSTITUTION_CHALLENGE_MAX_ATTEMPTS,
  INSTITUTION_CHALLENGE_MAX_STARTS_PER_EMAIL_PER_HOUR,
  INSTITUTION_CHALLENGE_MAX_STARTS_PER_HOUR,
  INSTITUTION_CHALLENGE_RESEND_COOLDOWN_SECONDS,
  INSTITUTION_CHALLENGE_TTL_MINUTES,
  collectInstitutionDomainCandidates,
  generateInstitutionSlugCandidates,
  hashInstitutionVerificationCode,
  isLikelyUuid,
  normalizeInstitutionName,
  resolveInstitutionCandidate,
  type InstitutionDomainCandidate,
  type InstitutionOrganization,
} from "@/lib/institutions/access";
import { createServiceClient } from "@/lib/supabase/service";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

function isUniqueViolation(error: { code?: string; message?: string } | null | undefined): boolean {
  return error?.code === "23505" || clean(error?.message).toLowerCase().includes("duplicate key");
}

function extractOrganization(value: unknown): InstitutionOrganization | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = clean(row.id);
  const name = clean(row.name);
  const slug = clean(row.slug);
  if (!id || !name || !slug) return null;
  return { id, name, slug };
}

type OrganizationDomainRow = {
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

type UserInstitutionEmailRow = {
  id: string;
  user_id: string;
  email: string;
  domain: string;
  organization_id: string;
  status: string;
  verified_at: string | null;
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

type MembershipRow = {
  organization_id: string;
  status: string;
  verified_at: string | null;
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

type ChallengeRow = {
  id: string;
  user_id: string;
  institution_email_id: string;
  expires_at: string;
  consumed_at: string | null;
  attempt_count: number;
  last_sent_at: string;
  created_at: string;
  user_institution_emails:
    | (UserInstitutionEmailRow & {
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
      })
    | Array<
        UserInstitutionEmailRow & {
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
        }
      >
    | null;
};

export type InstitutionAccessSnapshot = {
  activeMembership: {
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    verifiedAt: string | null;
  } | null;
  verifiedInstitutionEmails: Array<{
    id: string;
    email: string;
    domain: string;
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    verifiedAt: string | null;
  }>;
  pendingChallenge: {
    challengeId: string;
    institutionEmailId: string;
    email: string;
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    expiresAt: string;
    attemptCount: number;
    maxAttempts: number;
    resendAvailableAt: string;
  } | null;
  canCreateInstitutionMarkets: boolean;
};

export type StartInstitutionEmailResult =
  | {
      kind: "pending_challenge";
      challengeId: string;
      institutionEmailId: string;
      email: string;
      domain: string;
      organization: InstitutionOrganization;
      expiresAt: string;
      resendAvailableAt: string;
      code: string;
      createdOrganization: boolean;
    }
  | {
      kind: "ambiguous";
      candidates: InstitutionDomainCandidate[];
    }
  | {
      kind: "no_match";
      candidates: InstitutionDomainCandidate[];
    }
  | {
      kind: "rate_limited";
      message: string;
      retryAfterSeconds: number;
    }
  | {
      kind: "error";
      status: number;
      message: string;
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

async function getOrganizationById(organizationId: string): Promise<InstitutionOrganization | null> {
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

async function resolveOrganizationForDomain(input: {
  domain: string;
  selectedOrganizationId?: string;
  newInstitutionName?: string;
  createdBy: string;
}): Promise<
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
    }
> {
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

async function upsertInstitutionEmail(input: {
  userId: string;
  email: string;
  domain: string;
  organizationId: string;
}): Promise<{ id: string; email: string; domain: string; organizationId: string }> {
  const service = createServiceClient();

  const { data: existing, error: existingError } = await service
    .from("user_institution_emails")
    .select("id, user_id, email, domain, organization_id")
    .eq("email", input.email)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Unable to load institution email identity: ${existingError.message}`);
  }

  const existingRow = (existing ?? null) as
    | {
        id: string;
        user_id: string;
        email: string;
        domain: string;
        organization_id: string;
      }
    | null;

  if (existingRow && existingRow.user_id !== input.userId) {
    throw new Error("This institution email is already linked to another account.");
  }

  if (existingRow) {
    const { data: updated, error: updateError } = await service
      .from("user_institution_emails")
      .update({
        domain: input.domain,
        organization_id: input.organizationId,
        status: "pending_verification",
      })
      .eq("id", existingRow.id)
      .eq("user_id", input.userId)
      .select("id, email, domain, organization_id")
      .single();

    if (updateError || !updated) {
      throw new Error(`Unable to update institution email identity: ${updateError?.message ?? "Unknown error"}`);
    }

    return {
      id: updated.id,
      email: updated.email,
      domain: updated.domain,
      organizationId: updated.organization_id,
    };
  }

  const { data: created, error: createError } = await service
    .from("user_institution_emails")
    .insert({
      user_id: input.userId,
      email: input.email,
      domain: input.domain,
      organization_id: input.organizationId,
      status: "pending_verification",
    })
    .select("id, email, domain, organization_id")
    .single();

  if (createError || !created) {
    throw new Error(`Unable to create institution email identity: ${createError?.message ?? "Unknown error"}`);
  }

  return {
    id: created.id,
    email: created.email,
    domain: created.domain,
    organizationId: created.organization_id,
  };
}

async function countChallengesInWindow(input: {
  userId: string;
  institutionEmailId: string;
  sinceIso: string;
}): Promise<{ byUser: number; byEmail: number }> {
  const service = createServiceClient();

  const [userResult, emailResult] = await Promise.all([
    service
      .from("institution_email_challenges")
      .select("id", { count: "exact", head: true })
      .eq("user_id", input.userId)
      .gte("created_at", input.sinceIso),
    service
      .from("institution_email_challenges")
      .select("id", { count: "exact", head: true })
      .eq("institution_email_id", input.institutionEmailId)
      .gte("created_at", input.sinceIso),
  ]);

  if (userResult.error) {
    throw new Error(`Unable to enforce user verification rate limit: ${userResult.error.message}`);
  }

  if (emailResult.error) {
    throw new Error(`Unable to enforce email verification rate limit: ${emailResult.error.message}`);
  }

  return {
    byUser: userResult.count ?? 0,
    byEmail: emailResult.count ?? 0,
  };
}

async function createChallenge(input: {
  userId: string;
  institutionEmailId: string;
  code: string;
}): Promise<{ challengeId: string; expiresAt: string; resendAvailableAt: string }> {
  const service = createServiceClient();
  const now = new Date();
  const ttlMs = INSTITUTION_CHALLENGE_TTL_MINUTES * 60_000;
  const cooldownMs = INSTITUTION_CHALLENGE_RESEND_COOLDOWN_SECONDS * 1000;
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  const resendAvailableAt = new Date(now.getTime() + cooldownMs).toISOString();

  const { data: openRows, error: openError } = await service
    .from("institution_email_challenges")
    .select("id, expires_at, consumed_at, last_sent_at")
    .eq("institution_email_id", input.institutionEmailId)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (openError) {
    throw new Error(`Unable to inspect existing institution challenge: ${openError.message}`);
  }

  const openChallenge = (openRows ?? [])[0] as
    | {
        id: string;
        expires_at: string;
        consumed_at: string | null;
        last_sent_at: string;
      }
    | undefined;

  if (openChallenge) {
    const lastSentAtMs = Date.parse(openChallenge.last_sent_at);
    if (Number.isFinite(lastSentAtMs) && now.getTime() - lastSentAtMs < cooldownMs) {
      const remainingMs = cooldownMs - (now.getTime() - lastSentAtMs);
      return {
        challengeId: "",
        expiresAt: openChallenge.expires_at,
        resendAvailableAt: new Date(now.getTime() + remainingMs).toISOString(),
      };
    }

    await service
      .from("institution_email_challenges")
      .update({ consumed_at: now.toISOString() })
      .eq("id", openChallenge.id)
      .is("consumed_at", null);
  }

  const challengeId = crypto.randomUUID();
  const codeHash = hashInstitutionVerificationCode({
    challengeId,
    code: input.code,
  });

  const { error: createError } = await service.from("institution_email_challenges").insert({
    id: challengeId,
    user_id: input.userId,
    institution_email_id: input.institutionEmailId,
    code_hash: codeHash,
    expires_at: expiresAt,
    attempt_count: 0,
    last_sent_at: now.toISOString(),
  });

  if (createError) {
    throw new Error(`Unable to create institution verification challenge: ${createError.message}`);
  }

  return {
    challengeId,
    expiresAt,
    resendAvailableAt,
  };
}

export async function startInstitutionEmailVerification(input: {
  userId: string;
  email: string;
  domain: string;
  selectedOrganizationId?: string;
  newInstitutionName?: string;
}): Promise<StartInstitutionEmailResult> {
  const organizationResolution = await resolveOrganizationForDomain({
    domain: input.domain,
    selectedOrganizationId: input.selectedOrganizationId,
    newInstitutionName: input.newInstitutionName,
    createdBy: input.userId,
  });

  if (organizationResolution.kind === "ambiguous") {
    return {
      kind: "ambiguous",
      candidates: organizationResolution.candidates,
    };
  }

  if (organizationResolution.kind === "no_match") {
    return {
      kind: "no_match",
      candidates: organizationResolution.candidates,
    };
  }

  const organization = organizationResolution.organization;

  if (!isLikelyUuid(organization.id)) {
    return {
      kind: "error",
      status: 500,
      message: "Resolved institution is missing a valid organization id.",
    };
  }

  const identity = await upsertInstitutionEmail({
    userId: input.userId,
    email: input.email,
    domain: input.domain,
    organizationId: organization.id,
  });

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const counts = await countChallengesInWindow({
    userId: input.userId,
    institutionEmailId: identity.id,
    sinceIso: since,
  });

  if (counts.byUser >= INSTITUTION_CHALLENGE_MAX_STARTS_PER_HOUR) {
    return {
      kind: "rate_limited",
      message: "Too many institution verification requests from this account. Please try again shortly.",
      retryAfterSeconds: 60,
    };
  }

  if (counts.byEmail >= INSTITUTION_CHALLENGE_MAX_STARTS_PER_EMAIL_PER_HOUR) {
    return {
      kind: "rate_limited",
      message: "Too many institution verification requests for this email. Please try again shortly.",
      retryAfterSeconds: 60,
    };
  }

  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  const challenge = await createChallenge({
    userId: input.userId,
    institutionEmailId: identity.id,
    code,
  });

  if (!challenge.challengeId) {
    const resendAtMs = Date.parse(challenge.resendAvailableAt);
    const retryAfterSeconds = Number.isFinite(resendAtMs)
      ? Math.max(1, Math.ceil((resendAtMs - Date.now()) / 1000))
      : INSTITUTION_CHALLENGE_RESEND_COOLDOWN_SECONDS;

    return {
      kind: "rate_limited",
      message: "Please wait before requesting another verification code.",
      retryAfterSeconds,
    };
  }

  return {
    kind: "pending_challenge",
    challengeId: challenge.challengeId,
    institutionEmailId: identity.id,
    email: identity.email,
    domain: identity.domain,
    organization,
    expiresAt: challenge.expiresAt,
    resendAvailableAt: challenge.resendAvailableAt,
    code,
    createdOrganization: organizationResolution.createdOrganization,
  };
}

function normalizePendingChallenge(
  row: ChallengeRow | null
): InstitutionAccessSnapshot["pendingChallenge"] {
  if (!row) return null;

  const identity = asArray(row.user_institution_emails)[0] ?? null;
  if (!identity) return null;

  const organization = extractOrganization(asArray(identity.organizations)[0]);
  if (!organization) return null;

  return {
    challengeId: row.id,
    institutionEmailId: identity.id,
    email: identity.email,
    organizationId: organization.id,
    organizationName: organization.name,
    organizationSlug: organization.slug,
    expiresAt: row.expires_at,
    attemptCount: row.attempt_count,
    maxAttempts: INSTITUTION_CHALLENGE_MAX_ATTEMPTS,
    resendAvailableAt: new Date(
      Date.parse(row.last_sent_at) + INSTITUTION_CHALLENGE_RESEND_COOLDOWN_SECONDS * 1000
    ).toISOString(),
  };
}

export async function getInstitutionAccessSnapshot(userId: string): Promise<InstitutionAccessSnapshot> {
  const service = createServiceClient();

  const [membershipResult, verifiedEmailsResult, pendingChallengeResult] = await Promise.all([
    service
      .from("organization_memberships")
      .select("organization_id, status, verified_at, organizations(id, name, slug)")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("verified_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    service
      .from("user_institution_emails")
      .select("id, user_id, email, domain, organization_id, status, verified_at, organizations(id, name, slug)")
      .eq("user_id", userId)
      .eq("status", "verified")
      .order("verified_at", { ascending: false })
      .limit(30),
    service
      .from("institution_email_challenges")
      .select(
        "id, user_id, institution_email_id, expires_at, consumed_at, attempt_count, last_sent_at, created_at, user_institution_emails(id, user_id, email, domain, organization_id, status, verified_at, organizations(id, name, slug))"
      )
      .eq("user_id", userId)
      .is("consumed_at", null)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (membershipResult.error) {
    throw new Error(`Unable to load active institution membership: ${membershipResult.error.message}`);
  }

  if (verifiedEmailsResult.error) {
    throw new Error(`Unable to load verified institution emails: ${verifiedEmailsResult.error.message}`);
  }

  if (pendingChallengeResult.error) {
    throw new Error(`Unable to load pending institution challenge: ${pendingChallengeResult.error.message}`);
  }

  const membershipRow = (membershipResult.data ?? null) as MembershipRow | null;
  const activeOrganization = extractOrganization(asArray(membershipRow?.organizations)[0]);

  const activeMembership = activeOrganization
    ? {
        organizationId: activeOrganization.id,
        organizationName: activeOrganization.name,
        organizationSlug: activeOrganization.slug,
        verifiedAt: membershipRow?.verified_at ?? null,
      }
    : null;

  const verifiedEmails = ((verifiedEmailsResult.data ?? []) as UserInstitutionEmailRow[])
    .map((row) => {
      const organization = extractOrganization(asArray(row.organizations)[0]);
      if (!organization) return null;
      return {
        id: row.id,
        email: row.email,
        domain: row.domain,
        organizationId: organization.id,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        verifiedAt: row.verified_at,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const pendingChallenge = normalizePendingChallenge((pendingChallengeResult.data ?? null) as ChallengeRow | null);

  return {
    activeMembership,
    verifiedInstitutionEmails: verifiedEmails,
    pendingChallenge,
    canCreateInstitutionMarkets: Boolean(activeMembership),
  };
}

export async function resolveInstitutionOrganizationForAccessRules(organizationId: string): Promise<InstitutionOrganization | null> {
  return getOrganizationById(organizationId);
}

export function mapInstitutionVerificationRpcError(message: string): { status: number; error: string; detail: string } {
  const trimmed = clean(message);
  const match = trimmed.match(/^\[(INST_[A-Z_]+)\]\s*(.*)$/);
  if (!match) {
    return {
      status: 500,
      error: "Institution verification failed.",
      detail: trimmed || "Unknown institution verification error.",
    };
  }

  const code = match[1];
  const detail = clean(match[2]) || "Institution verification failed.";

  if (code === "INST_VALIDATION") {
    return { status: 400, error: "Institution verification validation failed.", detail };
  }

  if (code === "INST_FORBIDDEN") {
    return { status: 403, error: "Institution verification forbidden.", detail };
  }

  if (code === "INST_NOT_FOUND") {
    return { status: 404, error: "Institution verification challenge not found.", detail };
  }

  if (code === "INST_EXPIRED") {
    return { status: 410, error: "Institution verification challenge expired.", detail };
  }

  if (code === "INST_INVALID_CODE") {
    return { status: 400, error: "Invalid institution verification code.", detail };
  }

  if (code === "INST_TOO_MANY_ATTEMPTS") {
    return { status: 429, error: "Too many institution verification attempts.", detail };
  }

  if (code === "INST_CONFLICT") {
    return { status: 409, error: "Institution verification challenge conflict.", detail };
  }

  return {
    status: 500,
    error: "Institution verification failed.",
    detail,
  };
}

export async function verifyInstitutionChallenge(input: {
  userId: string;
  challengeId: string;
  code: string;
}): Promise<{
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  verifiedEmail: string;
  verifiedAt: string;
}> {
  const service = createServiceClient();
  const codeHash = hashInstitutionVerificationCode({
    challengeId: input.challengeId,
    code: input.code,
  });

  const { data, error } = await service.rpc("verify_institution_email_challenge", {
    p_user_id: input.userId,
    p_challenge_id: input.challengeId,
    p_code_hash: codeHash,
    p_max_attempts: INSTITUTION_CHALLENGE_MAX_ATTEMPTS,
  });

  if (error) {
    const mapped = mapInstitutionVerificationRpcError(error.message);
    throw Object.assign(new Error(mapped.detail), {
      status: mapped.status,
      publicError: mapped.error,
    });
  }

  if (!data || typeof data !== "object") {
    throw Object.assign(new Error("Malformed institution verification RPC response."), {
      status: 500,
      publicError: "Institution verification failed.",
    });
  }

  const row = data as Record<string, unknown>;
  const organizationId = clean(row.organizationId);
  const organizationName = clean(row.organizationName);
  const organizationSlug = clean(row.organizationSlug);
  const verifiedEmail = clean(row.verifiedEmail);
  const verifiedAt = clean(row.verifiedAt) || new Date().toISOString();

  if (!organizationId || !organizationName || !organizationSlug || !verifiedEmail) {
    throw Object.assign(new Error("Malformed institution verification RPC payload."), {
      status: 500,
      publicError: "Institution verification failed.",
    });
  }

  return {
    organizationId,
    organizationName,
    organizationSlug,
    verifiedEmail,
    verifiedAt,
  };
}
