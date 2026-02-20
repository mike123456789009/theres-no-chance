import { NextResponse } from "next/server";

import { getMarketDetail, getMarketViewerContext } from "@/lib/markets/read-markets";
import { executeMarketTrade, validateTradeExecutePayload } from "@/lib/markets/trade-engine";
import { createServiceClient, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";
import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function POST(request: Request, context: { params: Promise<{ marketId: string }> }) {
  if (!isSupabaseServerEnvConfigured()) {
    return NextResponse.json(
      {
        error: "Trade execution is unavailable: missing Supabase environment variables.",
        missingEnv: getMissingSupabaseServerEnv(),
      },
      { status: 503 }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const idempotencyHeader = request.headers.get("Idempotency-Key") ?? request.headers.get("idempotency-key");
  const payloadWithIdempotency = isRecord(payload)
    ? {
        ...payload,
        idempotencyKey: idempotencyHeader ?? payload.idempotencyKey,
      }
    : payload;

  const validation = validateTradeExecutePayload(payloadWithIdempotency);
  if (!validation.ok) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        details: validation.errors,
      },
      { status: 400 }
    );
  }

  const { marketId } = await context.params;

  try {
    if (isSupabaseServiceEnvConfigured()) {
      const service = createServiceClient();
      await service.rpc("sync_market_close_state", { p_market_id: marketId });
      await service.rpc("refresh_community_market_resolution_state", {
        p_market_id: marketId,
        p_resolution_window_hours: 24,
      });
    }

    const supabase = await createClient();
    const viewer = await getMarketViewerContext(supabase);

    if (!viewer.isAuthenticated || !viewer.userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const detail = await getMarketDetail({
      supabase,
      viewer,
      marketId,
    });

    if (detail.kind === "login_required") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    if (detail.kind === "institution_verification_required") {
      return NextResponse.json(
        {
          error: "Institution verification required.",
          detail: "Verify an institution email to trade this market.",
        },
        { status: 403 }
      );
    }

    if (detail.kind === "not_found") {
      return NextResponse.json({ error: "Market not found." }, { status: 404 });
    }

    if (detail.kind === "schema_missing") {
      return NextResponse.json(
        {
          error: "Market tables are not provisioned in this environment yet.",
          detail: detail.message,
        },
        { status: 503 }
      );
    }

    if (detail.kind === "error") {
      return NextResponse.json(
        {
          error: "Unable to load market for trade execution.",
          detail: detail.message,
        },
        { status: 500 }
      );
    }

    if (detail.market.status !== "open") {
      return NextResponse.json(
        {
          error: "Trade execution unavailable.",
          detail: "Market must be open for trading.",
        },
        { status: 409 }
      );
    }

    if (detail.market.viewerCanTrade === false) {
      return NextResponse.json(
        {
          error: "Trade execution unavailable.",
          detail:
            detail.market.viewerReadOnlyReason === "legacy_institution_access"
              ? "Your account can view this market due to an existing position, but new trades are restricted to active institution members."
              : "Your account is not eligible to trade this market.",
        },
        { status: 403 }
      );
    }

    const execution = await executeMarketTrade({
      marketId,
      userId: viewer.userId,
      side: validation.data.side,
      action: validation.data.action,
      shares: validation.data.shares,
      maxSlippageBps: validation.data.maxSlippageBps,
      idempotencyKey: validation.data.idempotencyKey,
    });

    if (!execution.ok) {
      return NextResponse.json(
        {
          error: execution.error,
          detail: execution.detail,
          missingEnv: execution.missingEnv,
        },
        { status: execution.status }
      );
    }

    return NextResponse.json(
      {
        execution: execution.data,
        market: {
          id: detail.market.id,
          status: detail.market.status,
          feeBps: detail.market.feeBps,
        },
        viewer: {
          userId: viewer.userId,
        },
      },
      { status: execution.data.reused ? 200 : 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Trade execution failed.",
        detail: error instanceof Error ? error.message : "Unknown server error.",
      },
      { status: 500 }
    );
  }
}
