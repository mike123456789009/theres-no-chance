import { NextResponse } from "next/server";

import { verifyInstitutionChallenge } from "@/lib/institutions/challenges";
import { getInstitutionAccessSnapshot } from "@/lib/institutions/memberships";
import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  if (!isSupabaseServerEnvConfigured()) {
    return NextResponse.json(
      {
        error: "Institution verification is unavailable: missing Supabase environment variables.",
        missingEnv: getMissingSupabaseServerEnv(),
      },
      { status: 503 }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const body = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : null;
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const challengeId = clean(body.challengeId);
  const code = clean(body.code).replace(/\s+/g, "");

  if (!challengeId) {
    return NextResponse.json({ error: "challengeId is required." }, { status: 400 });
  }

  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "code must be a 6-digit numeric value." }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const verified = await verifyInstitutionChallenge({
      userId: user.id,
      challengeId,
      code,
    });

    const snapshot = await getInstitutionAccessSnapshot(user.id);

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
