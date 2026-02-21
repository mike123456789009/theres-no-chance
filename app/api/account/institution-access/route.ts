import { NextResponse } from "next/server";

import { getServerEnvReadiness } from "@/lib/api/env-guards";
import { jsonEnvUnavailable, jsonInternalError, jsonUnauthorized } from "@/lib/api/http-errors";
import { getInstitutionAccessSnapshot } from "@/lib/institutions/memberships";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const serverEnv = getServerEnvReadiness();
  if (!serverEnv.isConfigured) {
    return jsonEnvUnavailable(
      "Institution access is unavailable: missing Supabase environment variables.",
      serverEnv.missingEnv
    );
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return jsonUnauthorized();
    }

    const snapshot = await getInstitutionAccessSnapshot(user.id);

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
