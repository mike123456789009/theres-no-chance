import { NextResponse } from "next/server";

import { loadMarketRequestContext, requireMarketDetail } from "@/lib/markets/request-context";
import { executeMarketTrade, validateTradeExecutePayload } from "@/lib/markets/trade-engine";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function POST(request: Request, context: { params: Promise<{ marketId: string }> }) {
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
    const requestContext = await loadMarketRequestContext({
      marketId,
      unavailableMessage: "Trade execution is unavailable: missing Supabase environment variables.",
      requireAuthenticatedViewer: true,
    });
    if (!requestContext.ok) {
      return requestContext.response;
    }

    const detailResult = requireMarketDetail({
      detail: requestContext.context.detail,
      guards: {
        loginRequired: {
          status: 401,
          error: "Unauthorized.",
        },
        institutionVerificationRequired: {
          status: 403,
          error: "Institution verification required.",
          detail: "Verify an institution email to trade this market.",
        },
        notFound: {
          status: 404,
          error: "Market not found.",
        },
        schemaMissing: {
          status: 503,
          error: "Market tables are not provisioned in this environment yet.",
          includeSourceMessage: true,
        },
        detailError: {
          status: 500,
          error: "Unable to load market for trade execution.",
          includeSourceMessage: true,
        },
      },
    });
    if (!detailResult.ok) {
      return detailResult.response;
    }

    const market = detailResult.market;
    const viewer = requestContext.context.viewer;
    const userId = viewer.userId;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    if (market.status !== "open") {
      return NextResponse.json(
        {
          error: "Trade execution unavailable.",
          detail: "Market must be open for trading.",
        },
        { status: 409 }
      );
    }

    if (market.viewerCanTrade === false) {
      return NextResponse.json(
        {
          error: "Trade execution unavailable.",
          detail:
            market.viewerReadOnlyReason === "legacy_institution_access"
              ? "Your account can view this market due to an existing position, but new trades are restricted to active institution members."
              : "Your account is not eligible to trade this market.",
        },
        { status: 403 }
      );
    }

    const execution = await executeMarketTrade({
      marketId,
      userId,
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
          id: market.id,
          status: market.status,
          feeBps: market.feeBps,
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
