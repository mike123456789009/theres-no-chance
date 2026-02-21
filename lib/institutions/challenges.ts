import crypto from "node:crypto";

import {
  INSTITUTION_CHALLENGE_MAX_ATTEMPTS,
  INSTITUTION_CHALLENGE_MAX_STARTS_PER_EMAIL_PER_HOUR,
  INSTITUTION_CHALLENGE_MAX_STARTS_PER_HOUR,
  INSTITUTION_CHALLENGE_RESEND_COOLDOWN_SECONDS,
  INSTITUTION_CHALLENGE_TTL_MINUTES,
  hashInstitutionVerificationCode,
  isLikelyUuid,
  type InstitutionDomainCandidate,
  type InstitutionOrganization,
} from "@/lib/institutions/access";
import { resolveOrganizationForDomain } from "@/lib/institutions/domain-resolution";
import { mapInstitutionVerificationRpcError } from "@/lib/institutions/errors";
import { createServiceClient } from "@/lib/supabase/service";

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

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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
