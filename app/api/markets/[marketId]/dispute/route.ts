import { NextResponse } from "next/server";

import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";

type DisputeBody = {
  reason?: string;
};

type MarketRow = {
  id: string;
  status: string;
  resolved_at: string | null;
  finalized_at: string | null;
} | null;

const DEFAULT_DISPUTE_WINDOW_HOURS = 48;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getDisputeWindowHours(): number {
  const parsed = Number(process.env.MARKET_DISPUTE_WINDOW_HOURS);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.max(1, Math.floor(parsed));
  }
  return DEFAULT_DISPUTE_WINDOW_HOURS;
}

function computeExpiresAt(resolvedAtIso: string, disputeWindowHours: number): string | null {
  const resolvedMs = Date.parse(resolvedAtIso);
  if (!Number.isFinite(resolvedMs)) return null;
  return new Date(resolvedMs + disputeWindowHours * 60 * 60 * 1000).toISOString();
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

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { data: marketData, error: marketError } = await supabase
      .from("markets")
      .select("id, status, resolved_at, finalized_at")
      .eq("id", marketId)
      .maybeSingle();

    if (marketError) {
      return NextResponse.json(
        {
          error: "Unable to load market for dispute.",
          detail: marketError.message,
        },
        { status: 500 }
      );
    }

    const market = marketData as MarketRow;
    if (!market) {
      return NextResponse.json({ error: "Market not found." }, { status: 404 });
    }

    if (market.status !== "resolved") {
      return NextResponse.json(
        {
          error: "Dispute unavailable.",
          detail: "Market must be resolved before disputes can be submitted.",
          status: market.status,
        },
        { status: 409 }
      );
    }

    if (market.finalized_at) {
      return NextResponse.json(
        {
          error: "Dispute unavailable.",
          detail: "Market is already finalized.",
        },
        { status: 409 }
      );
    }

    if (!market.resolved_at) {
      return NextResponse.json(
        {
          error: "Dispute unavailable.",
          detail: "Market resolved_at timestamp is missing.",
        },
        { status: 409 }
      );
    }

    const disputeWindowHours = getDisputeWindowHours();
    const expiresAt = computeExpiresAt(market.resolved_at, disputeWindowHours);
    if (!expiresAt) {
      return NextResponse.json(
        {
          error: "Dispute unavailable.",
          detail: "Unable to compute dispute window for this market resolution timestamp.",
        },
        { status: 409 }
      );
    }

    if (Date.now() > Date.parse(expiresAt)) {
      return NextResponse.json(
        {
          error: "Dispute window closed.",
          detail: "Disputes must be submitted before the dispute window expires.",
          expiresAt,
        },
        { status: 409 }
      );
    }

    const { data: disputeRow, error: disputeError } = await supabase
      .from("market_disputes")
      .insert({
        market_id: marketId,
        created_by: user.id,
        reason,
        expires_at: expiresAt,
      })
      .select("id, status, expires_at, created_at")
      .single();

    if (disputeError) {
      if (disputeError.code === "23505") {
        return NextResponse.json(
          {
            error: "Dispute already submitted.",
            detail: "This account has already submitted a dispute for this market.",
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          error: "Unable to submit dispute.",
          detail: disputeError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        dispute: disputeRow,
        market: {
          id: market.id,
          status: market.status,
          resolvedAt: market.resolved_at,
        },
      },
      { status: 201 }
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

