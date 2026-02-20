import { NextResponse } from "next/server";

import { requireAllowlistedAdmin } from "@/lib/auth/admin-guard";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

type AdjudicateBody = {
  status?: unknown;
  notes?: unknown;
  successGroupId?: unknown;
};

type AdjudicationStatus = "upheld" | "rejected" | "under_review";

function clean(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function parseStatus(value: unknown): AdjudicationStatus | null {
  const normalized = clean(value, 32).toLowerCase();
  if (normalized === "upheld" || normalized === "rejected" || normalized === "under_review") return normalized;
  return null;
}

function normalizeRpcResult(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function mapAdjudicationRpcError(message: string): { status: number; error: string; detail: string } {
  const trimmed = message.trim();
  const match = trimmed.match(/^\[(CHALLENGE_[A-Z_]+)\]\s*(.*)$/);
  const detail = match?.[2] || trimmed;

  switch (match?.[1]) {
    case "CHALLENGE_VALIDATION":
      return { status: 400, error: "Challenge adjudication validation failed.", detail };
    case "CHALLENGE_FORBIDDEN":
      return { status: 403, error: "Challenge adjudication forbidden.", detail };
    case "CHALLENGE_NOT_FOUND":
      return { status: 404, error: "Challenge not found.", detail };
    case "CHALLENGE_CONFLICT":
      return { status: 409, error: "Challenge adjudication conflict.", detail };
    default:
      return { status: 500, error: "Challenge adjudication failed.", detail: trimmed };
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ marketId: string; challengeId: string }> }
) {
  const auth = await requireAllowlistedAdmin();
  if (!auth.ok) {
    return auth.response;
  }

  if (!isSupabaseServiceEnvConfigured()) {
    return NextResponse.json(
      {
        error: "Challenge adjudication unavailable: missing service role configuration.",
        missingEnv: getMissingSupabaseServiceEnv(),
      },
      { status: 503 }
    );
  }

  const { marketId, challengeId } = await context.params;

  let body: AdjudicateBody;
  try {
    body = (await request.json()) as AdjudicateBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const status = parseStatus(body.status);
  if (!status) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        details: ["status must be one of: upheld, rejected, under_review."],
      },
      { status: 400 }
    );
  }

  const notes = clean(body.notes, 1000) || null;
  const successGroupId = clean(body.successGroupId, 64) || null;

  try {
    const service = createServiceClient();
    const { data, error } = await service.rpc("admin_adjudicate_market_challenge", {
      p_market_id: marketId,
      p_dispute_id: challengeId,
      p_admin_user_id: auth.adminUser.id,
      p_status: status,
      p_notes: notes,
      p_success_group_id: successGroupId,
    });

    if (error) {
      const mapped = mapAdjudicationRpcError(error.message);
      return NextResponse.json(
        {
          error: mapped.error,
          detail: mapped.detail,
        },
        { status: mapped.status }
      );
    }

    const result = normalizeRpcResult(data);
    if (!result) {
      return NextResponse.json(
        {
          error: "Challenge adjudication failed.",
          detail: "Malformed admin_adjudicate_market_challenge RPC response.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Challenge adjudicated.",
      challenge: result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Challenge adjudication failed.",
        detail: error instanceof Error ? error.message : "Unknown server error.",
      },
      { status: 500 }
    );
  }
}
