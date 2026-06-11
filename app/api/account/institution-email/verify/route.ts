import { NextResponse } from "next/server";

import { jsonError } from "@/lib/api/http-errors";
import { parseJsonBody, requireAuthenticatedUser, requireServerEnv } from "@/lib/api/route-primitives";
import { verifyInstitutionChallenge } from "@/lib/institutions/challenges";
import { getInstitutionAccessSnapshot } from "@/lib/institutions/memberships";
import { cleanText, isRecord } from "@/lib/shared/primitives";

function clean(value: unknown): string {
  return cleanText(value);
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
  const challengeId = clean(body.challengeId);
  const code = clean(body.code).replace(/\s+/g, "");

  if (!challengeId) {
    return jsonError(400, "challengeId is required.");
  }

  if (!/^\d{6}$/.test(code)) {
    return jsonError(400, "code must be a 6-digit numeric value.");
  }

  try {
    const user = await requireAuthenticatedUser();
    if (!user.ok) {
      return user.response;
    }

    const verified = await verifyInstitutionChallenge({
      userId: user.value.id,
      challengeId,
      code,
    });

    const snapshot = await getInstitutionAccessSnapshot(user.value.id);

    return NextResponse.json({
      message: "Institution email verified and active membership updated.",
      verified,
      activeMembership: snapshot.activeMembership,
      verifiedInstitutionEmails: snapshot.verifiedInstitutionEmails,
      pendingChallenge: snapshot.pendingChallenge,
      canCreateInstitutionMarkets: snapshot.canCreateInstitutionMarkets,
    });
  } catch (error) {
    const status =
      typeof error === "object" && error !== null && "status" in error && typeof (error as { status?: unknown }).status === "number"
        ? ((error as { status: number }).status ?? 500)
        : 500;

    const publicError =
      typeof error === "object" && error !== null && "publicError" in error && typeof (error as { publicError?: unknown }).publicError === "string"
        ? ((error as { publicError: string }).publicError ?? "Institution verification failed.")
        : "Institution verification failed.";

    return NextResponse.json(
      {
        error: publicError,
        detail: error instanceof Error ? error.message : "Unknown institution verification error.",
      },
      { status }
    );
  }
}
