import { NextResponse } from "next/server";

import { getServerEnvReadiness } from "@/lib/api/env-guards";
import { jsonEnvUnavailable, jsonInternalError } from "@/lib/api/http-errors";
import { requireAuthenticatedUser } from "@/lib/api/route-primitives";
import { getInstitutionAccessSnapshot } from "@/lib/institutions/memberships";

export async function GET() {
  const serverEnv = getServerEnvReadiness();
  if (!serverEnv.isConfigured) {
    return jsonEnvUnavailable(
      "Institution access is unavailable: missing Supabase environment variables.",
      serverEnv.missingEnv
    );
  }

  try {
    const user = await requireAuthenticatedUser();
    if (!user.ok) {
      return user.response;
    }

    const snapshot = await getInstitutionAccessSnapshot(user.value.id);

    return NextResponse.json({
      activeMembership: snapshot.activeMembership,
      verifiedInstitutionEmails: snapshot.verifiedInstitutionEmails,
      pendingChallenge: snapshot.pendingChallenge,
      canCreateInstitutionMarkets: snapshot.canCreateInstitutionMarkets,
    });
  } catch (error) {
    return jsonInternalError("Unable to load institution access state.", error, "Unknown institution access error.");
  }
}
