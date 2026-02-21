import { NextResponse } from "next/server";

import { requireAllowlistedAdmin } from "@/lib/auth/admin-guard";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

const FIXED_DISPUTE_WINDOW_HOURS = 24;

type FinalizeBody = {
  outcome?: unknown;
};

type FinalOutcome = "yes" | "no" | "void";

function normalizeRpcResult(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function clean(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function parseOutcome(value: unknown): FinalOutcome | null {
  const normalized = clean(value, 8).toLowerCase();
  if (normalized === "yes" || normalized === "no" || normalized === "void") return normalized;
  return null;
}

function mapFinalizeRpcError(message: string): { status: number; error: string; detail: string } {
  const trimmed = message.trim();
  const match = trimmed.match(/^\[(FINALIZE_[A-Z_]+)\]\s*(.*)$/);
  const detail = match?.[2] || trimmed;

  switch (match?.[1]) {
    case "FINALIZE_VALIDATION":
      return { status: 400, error: "Market finalization validation failed.", detail };
    case "FINALIZE_FORBIDDEN":
      return { status: 403, error: "Market finalization forbidden.", detail };
    case "FINALIZE_NOT_FOUND":
      return { status: 404, error: "Market not found.", detail };
    case "FINALIZE_CONFLICT":
      return { status: 409, error: "Market finalization unavailable.", detail };
    default:
      return { status: 500, error: "Market finalization failed.", detail: trimmed };
  }
}

export async function POST(request: Request, context: { params: Promise<{ marketId: string }> }) {
  const auth = await requireAllowlistedAdmin();
  if (!auth.ok) {
    return auth.response;
  }

  if (!isSupabaseServiceEnvConfigured()) {
    return NextResponse.json(
      {
        error: "Market finalization unavailable: missing service role configuration.",
        missingEnv: getMissingSupabaseServiceEnv(),
      },
      { status: 503 }
    );
  }

  const { marketId } = await context.params;
  let body: FinalizeBody = {};

  try {
    body = (await request.json()) as FinalizeBody;
  } catch {
    body = {};
  }

  const parsedOutcome = parseOutcome(body.outcome);
  if (body.outcome !== undefined && !parsedOutcome) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        details: ["outcome must be one of: yes, no, void."],
      },
      { status: 400 }
    );
  }

  try {
    const service = createServiceClient();
    const { data, error } = await service.rpc("admin_finalize_market_v2", {
      p_market_id: marketId,
      p_admin_user_id: auth.adminUser.id,
      p_outcome: parsedOutcome,
      p_dispute_window_hours: FIXED_DISPUTE_WINDOW_HOURS,
    });

    if (error) {
      const mapped = mapFinalizeRpcError(error.message);
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
          error: "Market finalization failed.",
          detail: "Malformed admin_finalize_market RPC response.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Market finalized.",
      finalization: result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Market finalization failed.",
        detail: error instanceof Error ? error.message : "Unknown server error.",
      },
      { status: 500 }
    );
  }
}
