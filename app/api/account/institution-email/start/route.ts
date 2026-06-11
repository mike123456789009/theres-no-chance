import { NextResponse } from "next/server";

import { jsonError } from "@/lib/api/http-errors";
import { parseJsonBody, requireAuthenticatedUser, requireServerEnv } from "@/lib/api/route-primitives";
import { normalizeInstitutionEmail, isEduDomain } from "@/lib/institutions/access";
import { startInstitutionEmailVerification } from "@/lib/institutions/challenges";
import { sendInstitutionVerificationEmail } from "@/lib/institutions/email";
import { cleanText, isRecord } from "@/lib/shared/primitives";

function clean(value: unknown): string {
  return cleanText(value);
}

function normalizeOrganizationChoice(value: unknown): string | undefined {
  const normalized = clean(value);
  return normalized.length > 0 ? normalized : undefined;
}

export async function POST(request: Request) {
  const env = requireServerEnv("Institution verification is unavailable: missing Supabase environment variables.");
  if (!env.ok) {
    return env.response;
  }

  const parsed = await parseJsonBody(request);
  if (!parsed.ok) {
    return parsed.response;
  }

  if (!isRecord(parsed.value)) {
    return jsonError(400, "Invalid request body.");
  }

  const body = parsed.value;
  const normalizedEmail = normalizeInstitutionEmail(body.email);
  if (!normalizedEmail) {
    return jsonError(400, "Institution email must be a valid email address.");
  }

  if (!isEduDomain(normalizedEmail.domain)) {
    return jsonError(400, "Institution email must use a .edu domain.");
  }

  const selectedOrganizationId = normalizeOrganizationChoice(body.selectedOrganizationId);
  const newInstitutionName = clean(body.newInstitutionName);

  try {
    const user = await requireAuthenticatedUser();
    if (!user.ok) {
      return user.response;
    }

    const started = await startInstitutionEmailVerification({
      userId: user.value.id,
      email: normalizedEmail.email,
      domain: normalizedEmail.domain,
      selectedOrganizationId,
      newInstitutionName,
    });

    if (started.kind === "ambiguous") {
      return NextResponse.json(
        {
          error: "Multiple institutions match this email domain.",
          code: "AMBIGUOUS_INSTITUTION",
          candidates: started.candidates.map((candidate) => ({
            organizationId: candidate.id,
            organizationName: candidate.name,
            organizationSlug: candidate.slug,
            matchedDomain: candidate.domain,
            allowSubdomains: candidate.allowSubdomains,
            matchType: candidate.matchType,
          })),
        },
        { status: 409 }
      );
    }

    if (started.kind === "no_match") {
      return NextResponse.json(
        {
          error: "No institution mapping was found for this .edu domain.",
          code: "NO_INSTITUTION_MATCH",
          candidates: started.candidates,
        },
        { status: 409 }
      );
    }

    if (started.kind === "rate_limited") {
      return NextResponse.json(
        {
          error: started.message,
          code: "RATE_LIMITED",
          retryAfterSeconds: started.retryAfterSeconds,
        },
        { status: 429 }
      );
    }

    if (started.kind === "error") {
      return NextResponse.json(
        {
          error: started.message,
        },
        { status: started.status }
      );
    }

    try {
      await sendInstitutionVerificationEmail({
        toEmail: started.email,
        code: started.code,
        organizationName: started.organization.name,
        expiresInMinutes: 15,
      });
    } catch (error) {
      return NextResponse.json(
        {
          error: "Unable to send institution verification email.",
          detail: error instanceof Error ? error.message : "Unknown email delivery error.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        message: "Verification code sent to institution email.",
        pendingChallenge: {
          challengeId: started.challengeId,
          institutionEmailId: started.institutionEmailId,
          email: started.email,
          domain: started.domain,
          organizationId: started.organization.id,
          organizationName: started.organization.name,
          organizationSlug: started.organization.slug,
          expiresAt: started.expiresAt,
          resendAvailableAt: started.resendAvailableAt,
          maxAttempts: 5,
        },
        createdOrganization: started.createdOrganization,
      },
      { status: 200 }
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown institution verification start error.";
    const lowered = detail.toLowerCase();

    if (lowered.includes("user_institution_emails_domain_edu")) {
      return NextResponse.json(
        {
          error: "Institution email domain must end with .edu.",
          code: "INVALID_EDU_DOMAIN",
          detail,
        },
        { status: 400 }
      );
    }

    if (lowered.includes("already linked to another account")) {
      return NextResponse.json(
        {
          error: "This institution email is already linked to another account.",
          code: "EMAIL_IN_USE",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error: "Unable to start institution verification.",
        detail,
      },
      { status: 500 }
    );
  }
}
