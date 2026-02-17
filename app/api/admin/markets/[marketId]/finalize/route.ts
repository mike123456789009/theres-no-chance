import { NextResponse } from "next/server";

import { requireAllowlistedAdmin } from "@/lib/auth/admin-guard";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

const DEFAULT_DISPUTE_WINDOW_HOURS = 48;

function normalizeRpcResult(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function getDisputeWindowHours(): number {
  const parsed = Number(process.env.MARKET_DISPUTE_WINDOW_HOURS);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.max(1, Math.floor(parsed));
  }
  return DEFAULT_DISPUTE_WINDOW_HOURS;
}

export async function POST(_request: Request, context: { params: Promise<{ marketId: string }> }) {
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

  try {
    const service = createServiceClient();
    const { data, error } = await service.rpc("admin_finalize_market", {
      p_market_id: marketId,
      p_admin_user_id: auth.adminUser.id,
      p_dispute_window_hours: getDisputeWindowHours(),
    });

    if (error) {
      return NextResponse.json(
        {
          error: "Market finalization failed.",
          detail: error.message,
        },
        { status: 500 }
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

