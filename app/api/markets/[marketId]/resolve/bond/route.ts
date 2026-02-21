import { NextResponse } from "next/server";

import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";
import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";

type ResolverBondBody = {
  outcome?: unknown;
  bondAmount?: unknown;
};

type ResolverOutcome = "yes" | "no";

const FIXED_RESOLUTION_WINDOW_HOURS = 24;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseOutcome(value: unknown): ResolverOutcome | null {
  const normalized = clean(value).toLowerCase();
  if (normalized === "yes" || normalized === "no") return normalized;
  return null;
}

function parseBondAmount(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return 1;
  return Math.round(parsed * 1_000_000) / 1_000_000;
}

function normalizeRpcResult(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function mapResolverBondRpcError(message: string): { status: number; error: string; detail: string } {
  const trimmed = message.trim();
  const match = trimmed.match(/^\[(RESOLVE_[A-Z_]+)\]\s*(.*)$/);
  const detail = match?.[2] || trimmed;

  switch (match?.[1]) {
    case "RESOLVE_VALIDATION":
      return { status: 400, error: "Resolver bond validation failed.", detail };
    case "RESOLVE_FORBIDDEN":
      return { status: 403, error: "Resolver bond submission forbidden.", detail };
    case "RESOLVE_NOT_FOUND":
      return { status: 404, error: "Market not found.", detail };
    case "RESOLVE_CONFLICT":
    case "RESOLVE_FUNDS":
      return { status: 409, error: "Resolver bond submission unavailable.", detail };
    default:
      return { status: 500, error: "Resolver bond submission failed.", detail: trimmed };
  }
}

export async function POST(request: Request, context: { params: Promise<{ marketId: string }> }) {
  if (!isSupabaseServerEnvConfigured()) {
    return NextResponse.json(
      {
        error: "Resolver bond submission is unavailable: missing Supabase environment variables.",
        missingEnv: getMissingSupabaseServerEnv(),
      },
      { status: 503 }
    );
  }

  if (!isSupabaseServiceEnvConfigured()) {
    return NextResponse.json(
      {
        error: "Resolver bond submission is unavailable: missing service role configuration.",
        missingEnv: getMissingSupabaseServiceEnv(),
      },
      { status: 503 }
    );
  }

  const { marketId } = await context.params;

  let body: ResolverBondBody;
  try {
    body = (await request.json()) as ResolverBondBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const outcome = parseOutcome(body.outcome);
  if (!outcome) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        details: ["outcome must be one of: yes, no."],
      },
      { status: 400 }
    );
  }

  const bondAmount = parseBondAmount(body.bondAmount);
  if (!Number.isFinite(bondAmount) || bondAmount <= 0) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        details: ["bondAmount must be greater than zero."],
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
    const { data, error } = await service.rpc("submit_market_resolver_bond", {
      p_market_id: marketId,
      p_user_id: user.id,
      p_outcome: outcome,
      p_bond_amount: bondAmount,
      p_resolution_window_hours: FIXED_RESOLUTION_WINDOW_HOURS,
    });

    if (error) {
      const mapped = mapResolverBondRpcError(error.message);
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
          error: "Resolver bond submission failed.",
          detail: "Malformed submit_market_resolver_bond RPC response.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        resolverBond: result,
      },
      { status: result.reused === true ? 200 : 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Resolver bond submission failed.",
        detail: error instanceof Error ? error.message : "Unknown server error.",
      },
      { status: 500 }
    );
  }
}
