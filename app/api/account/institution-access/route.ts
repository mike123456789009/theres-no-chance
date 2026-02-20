import { NextResponse } from "next/server";

import { getInstitutionAccessSnapshot } from "@/lib/institutions/service";
import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";

export async function GET() {
  if (!isSupabaseServerEnvConfigured()) {
    return NextResponse.json(
      {
        error: "Institution access is unavailable: missing Supabase environment variables.",
        missingEnv: getMissingSupabaseServerEnv(),
      },
      { status: 503 }
    );
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

    const snapshot = await getInstitutionAccessSnapshot(user.id);

    return NextResponse.json({
      activeMembership: snapshot.activeMembership,
      verifiedInstitutionEmails: snapshot.verifiedInstitutionEmails,
      pendingChallenge: snapshot.pendingChallenge,
      canCreateInstitutionMarkets: snapshot.canCreateInstitutionMarkets,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to load institution access state.",
        detail: error instanceof Error ? error.message : "Unknown institution access error.",
      },
      { status: 500 }
    );
  }
}
