import {
  INSTITUTION_CHALLENGE_MAX_ATTEMPTS,
  INSTITUTION_CHALLENGE_RESEND_COOLDOWN_SECONDS,
} from "@/lib/institutions/access";
import { asArray, extractOrganization, getOrganizationById } from "@/lib/institutions/domain-resolution";
import { createServiceClient } from "@/lib/supabase/service";

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

export async function resolveInstitutionOrganizationForAccessRules(organizationId: string) {
  return getOrganizationById(organizationId);
}
