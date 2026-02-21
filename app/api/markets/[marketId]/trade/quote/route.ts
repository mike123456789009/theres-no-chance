import { NextResponse } from "next/server";

import { loadMarketRequestContext, requireMarketDetail } from "@/lib/markets/request-context";
import { quoteMarketTrade, validateTradeQuotePayload } from "@/lib/markets/trade-engine";

export async function POST(request: Request, context: { params: Promise<{ marketId: string }> }) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const validation = validateTradeQuotePayload(payload);
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
      unavailableMessage: "Trade quote is unavailable: missing Supabase environment variables.",
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
          detail: "Verify an institution email to quote this market.",
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
          error: "Unable to load market for trade quote.",
          includeSourceMessage: true,
        },
      },
    });
    if (!detailResult.ok) {
      return detailResult.response;
    }

    const market = detailResult.market;
    const viewer = requestContext.context.viewer;

    if (market.status !== "open") {
      return NextResponse.json(
        {
          error: "Trade quote unavailable.",
          detail: "Market must be open for trading.",
        },
        { status: 409 }
      );
    }

    if (market.viewerCanTrade === false) {
      return NextResponse.json(
        {
          error: "Trade quote unavailable.",
          detail:
            market.viewerReadOnlyReason === "legacy_institution_access"
              ? "Your account can view this market due to an existing position, but new trades are restricted to active institution members."
              : "Your account is not eligible to trade this market.",
        },
        { status: 403 }
      );
    }

    const quote = await quoteMarketTrade({
      marketId,
      side: validation.data.side,
      action: validation.data.action,
      shares: validation.data.shares,
      maxSlippageBps: validation.data.maxSlippageBps,
    });

    if (!quote.ok) {
      return NextResponse.json(
        {
          error: quote.error,
          detail: quote.detail,
          missingEnv: quote.missingEnv,
        },
        { status: quote.status }
      );
    }

    return NextResponse.json({
      quote: quote.data,
      market: {
        id: market.id,
        status: market.status,
        feeBps: market.feeBps,
        priceYes: market.priceYes,
        priceNo: market.priceNo,
      },
      viewer: {
        userId: viewer.userId,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Trade quote failed.",
        detail: error instanceof Error ? error.message : "Unknown server error.",
      },
      { status: 500 }
    );
  }
}
