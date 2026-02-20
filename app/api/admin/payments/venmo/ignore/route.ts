import { NextResponse } from "next/server";

import { requireAllowlistedAdmin } from "@/lib/auth/admin-guard";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

type IgnoreBody = {
  incomingPaymentId?: unknown;
  reason?: unknown;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const auth = await requireAllowlistedAdmin();
  if (!auth.ok) {
    return auth.response;
  }

  if (!isSupabaseServiceEnvConfigured()) {
    return NextResponse.json(
      {
        error: "Venmo ignore action unavailable: missing service environment variables.",
        missingEnv: getMissingSupabaseServiceEnv(),
      },
      { status: 503 }
    );
  }

  let body: IgnoreBody;
  try {
    body = (await request.json()) as IgnoreBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const incomingPaymentId = clean(body.incomingPaymentId);
  if (!incomingPaymentId) {
    return NextResponse.json({ error: "incomingPaymentId is required." }, { status: 400 });
  }

  const reason = clean(body.reason) || `Ignored by admin ${auth.adminUser.id}`;
  const service = createServiceClient();

  const { data, error } = await service
    .from("venmo_incoming_payments")
    .update({
      match_status: "ignored",
      error_message: reason.slice(0, 1000),
    })
    .eq("id", incomingPaymentId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Incoming payment row not found or could not be updated." }, { status: 404 });
  }

  return NextResponse.json({
    message: "Incoming Venmo payment marked ignored.",
    incomingPaymentId,
  });
}
