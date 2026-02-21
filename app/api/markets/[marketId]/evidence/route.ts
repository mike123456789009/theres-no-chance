import { NextResponse } from "next/server";

import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";

type EvidenceBody = {
  evidenceUrl?: unknown;
  evidenceText?: unknown;
  notes?: unknown;
  submittedOutcome?: unknown;
};

type EvidenceOutcome = "yes" | "no";

const EVIDENCE_ALLOWED_STATUSES = new Set(["closed", "pending_resolution", "resolved"]);

function clean(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizeOptionalText(value: unknown, maxLength: number): string | null {
  const cleaned = clean(value, maxLength);
  return cleaned.length > 0 ? cleaned : null;
}

function normalizeHttpsUrl(value: string | null): string | null {
  if (!value) return null;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function parseOutcome(value: unknown): EvidenceOutcome | null {
  const cleaned = clean(value, 8).toLowerCase();
  if (cleaned === "yes" || cleaned === "no") return cleaned;
  return null;
}

export async function POST(request: Request, context: { params: Promise<{ marketId: string }> }) {
  if (!isSupabaseServerEnvConfigured()) {
    return NextResponse.json(
      {
        error: "Evidence submission is unavailable: missing Supabase environment variables.",
        missingEnv: getMissingSupabaseServerEnv(),
      },
      { status: 503 }
    );
  }

  const { marketId } = await context.params;

  let body: EvidenceBody;
  try {
    body = (await request.json()) as EvidenceBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const evidenceUrlRaw = normalizeOptionalText(body.evidenceUrl, 1000);
  const evidenceUrl = normalizeHttpsUrl(evidenceUrlRaw);
  const evidenceText = normalizeOptionalText(body.evidenceText, 2_000);
  const notes = normalizeOptionalText(body.notes, 1_000);
  const submittedOutcome = parseOutcome(body.submittedOutcome);

  if (evidenceUrlRaw && !evidenceUrl) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        details: ["evidenceUrl must be a valid https URL when provided."],
      },
      { status: 400 }
    );
  }

  if (!evidenceUrl && !evidenceText) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        details: ["Provide at least one of evidenceUrl or evidenceText."],
      },
      { status: 400 }
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

    const { data: market, error: marketError } = await supabase
      .from("markets")
      .select("id, status, finalized_at")
      .eq("id", marketId)
      .maybeSingle();

    if (marketError) {
      return NextResponse.json(
        {
          error: "Unable to validate market status for evidence submission.",
          detail: marketError.message,
        },
        { status: 500 }
      );
    }

    if (!market) {
      return NextResponse.json({ error: "Market not found." }, { status: 404 });
    }

    const status = typeof market.status === "string" ? market.status : "";
    if (!EVIDENCE_ALLOWED_STATUSES.has(status) || market.finalized_at) {
      return NextResponse.json(
        {
          error: "Evidence submissions are only accepted while community resolution is active.",
        },
        { status: 409 }
      );
    }

    const { data: inserted, error: insertError } = await supabase
      .from("market_evidence")
      .insert({
        market_id: marketId,
        submitted_by: user.id,
        evidence_url: evidenceUrl,
        evidence_text: evidenceText,
        notes,
        submitted_outcome: submittedOutcome,
      })
      .select("id, market_id, submitted_by, evidence_url, evidence_text, notes, submitted_outcome, created_at")
      .single();

    if (insertError || !inserted) {
      return NextResponse.json(
        {
          error: "Unable to submit evidence.",
          detail: insertError?.message ?? "Unknown insertion error.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ evidence: inserted }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Evidence submission failed.",
        detail: error instanceof Error ? error.message : "Unknown server error.",
      },
      { status: 500 }
    );
  }
}
