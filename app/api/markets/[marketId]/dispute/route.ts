import { NextResponse } from "next/server";

import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";
import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";

type DisputeBody = {
  reason?: string;
  proposedOutcome?: unknown;
};

const FIXED_DISPUTE_WINDOW_HOURS = 24;

type ChallengeOutcome = "yes" | "no";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseOutcome(value: unknown): ChallengeOutcome | null {
  const normalized = clean(value).toLowerCase();
  if (normalized === "yes" || normalized === "no") return normalized;
  return null;
}

function normalizeRpcResult(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function mapChallengeRpcError(message: string): { status: number; error: string; detail: string } {
  const trimmed = message.trim();
  const match = trimmed.match(/^\[(CHALLENGE_[A-Z_]+)\]\s*(.*)$/);
  const detail = match?.[2] || trimmed;

  switch (match?.[1]) {
    case "CHALLENGE_VALIDATION":
      return { status: 400, error: "Challenge validation failed.", detail };
    case "CHALLENGE_FORBIDDEN":
      return { status: 403, error: "Challenge submission forbidden.", detail };
    case "CHALLENGE_NOT_FOUND":
      return { status: 404, error: "Market challenge target not found.", detail };
    case "CHALLENGE_CONFLICT":
    case "CHALLENGE_FUNDS":
      return { status: 409, error: "Challenge submission unavailable.", detail };
    default:
      return { status: 500, error: "Unable to submit challenge.", detail: trimmed };
  }
}

export async function POST(request: Request, context: { params: Promise<{ marketId: string }> }) {
  if (!isSupabaseServerEnvConfigured()) {
    return NextResponse.json(
      {
        error: "Market dispute is unavailable: missing Supabase environment variables.",
        missingEnv: getMissingSupabaseServerEnv(),
      },
      { status: 503 }
    );
  }

  if (!isSupabaseServiceEnvConfigured()) {
    return NextResponse.json(
      {
        error: "Market dispute is unavailable: missing service role configuration.",
        missingEnv: getMissingSupabaseServiceEnv(),
      },
      { status: 503 }
    );
  }

  const { marketId } = await context.params;

  let body: DisputeBody;
  try {
    body = (await request.json()) as DisputeBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const reason = clean(body.reason);
  if (!reason || reason.length < 10) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        details: ["reason must be at least 10 characters."],
      },
      { status: 400 }
    );
  }

  if (reason.length > 1000) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        details: ["reason must be 1000 characters or less."],
      },
      { status: 400 }
    );
  }

  const proposedOutcome = parseOutcome(body.proposedOutcome);

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const service = createServiceClient();
    const { data, error } = await service.rpc("submit_market_dispute_challenge", {
      p_market_id: marketId,
      p_user_id: user.id,
      p_reason: reason,
      p_proposed_outcome: proposedOutcome,
      p_dispute_window_hours: FIXED_DISPUTE_WINDOW_HOURS,
    });

    if (error) {
      const mapped = mapChallengeRpcError(error.message);
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
          error: "Unable to submit challenge.",
          detail: "Malformed submit_market_dispute_challenge RPC response.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        dispute: result,
      },
      { status: result.reused === true ? 200 : 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Market dispute failed.",
        detail: error instanceof Error ? error.message : "Unknown server error.",
      },
      { status: 500 }
    );
  }
}
