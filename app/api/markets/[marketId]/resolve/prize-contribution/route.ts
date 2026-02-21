import { NextResponse } from "next/server";

import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";
import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";

type PrizeContributionBody = {
  amount?: unknown;
};

function parseAmount(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return Number.NaN;
  return Math.round(parsed * 1_000_000) / 1_000_000;
}

function normalizeRpcResult(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function mapContributionRpcError(message: string): { status: number; error: string; detail: string } {
  const trimmed = message.trim();
  const match = trimmed.match(/^\[(PRIZE_[A-Z_]+)\]\s*(.*)$/);
  const detail = match?.[2] || trimmed;

  switch (match?.[1]) {
    case "PRIZE_VALIDATION":
      return { status: 400, error: "Prize contribution validation failed.", detail };
    case "PRIZE_FORBIDDEN":
      return { status: 403, error: "Prize contribution forbidden.", detail };
    case "PRIZE_NOT_FOUND":
      return { status: 404, error: "Market not found.", detail };
    case "PRIZE_CONFLICT":
    case "PRIZE_FUNDS":
      return { status: 409, error: "Prize contribution unavailable.", detail };
    default:
      return { status: 500, error: "Prize contribution failed.", detail: trimmed };
  }
}

export async function POST(request: Request, context: { params: Promise<{ marketId: string }> }) {
  if (!isSupabaseServerEnvConfigured()) {
    return NextResponse.json(
      {
        error: "Prize contribution is unavailable: missing Supabase environment variables.",
        missingEnv: getMissingSupabaseServerEnv(),
      },
      { status: 503 }
    );
  }

  if (!isSupabaseServiceEnvConfigured()) {
    return NextResponse.json(
      {
        error: "Prize contribution is unavailable: missing service role configuration.",
        missingEnv: getMissingSupabaseServiceEnv(),
      },
      { status: 503 }
    );
  }

  const { marketId } = await context.params;

  let body: PrizeContributionBody;
  try {
    body = (await request.json()) as PrizeContributionBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const amount = parseAmount(body.amount);
  if (!Number.isFinite(amount) || amount < 1) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        details: ["amount must be at least 1.00."],
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

    const service = createServiceClient();
    const { data, error } = await service.rpc("submit_market_resolver_prize_contribution", {
      p_market_id: marketId,
      p_user_id: user.id,
      p_amount: amount,
    });

    if (error) {
      const mapped = mapContributionRpcError(error.message);
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
          error: "Prize contribution failed.",
          detail: "Malformed submit_market_resolver_prize_contribution RPC response.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ contribution: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Prize contribution failed.",
        detail: error instanceof Error ? error.message : "Unknown server error.",
      },
      { status: 500 }
    );
  }
}
