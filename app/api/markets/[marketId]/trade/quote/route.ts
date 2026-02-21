import { loadMarketRequestContext, requireMarketDetail } from "@/lib/markets/request-context";
import {
  buildTradeDetailGuards,
  jsonTradeEngineFailure,
  jsonTradeMarketNotOpen,
  jsonTradeUnhandled,
  jsonTradeValidationFailed,
  jsonTradeViewerIneligible,
  parseTradeJsonBody,
  tradeUnavailableMessage,
} from "@/lib/markets/trade/http";
import { quoteMarketTrade, validateTradeQuotePayload } from "@/lib/markets/trade-engine";

export async function POST(request: Request, context: { params: Promise<{ marketId: string }> }) {
  const parsedBody = await parseTradeJsonBody(request);
  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const validation = validateTradeQuotePayload(parsedBody.payload);
  if (!validation.ok) {
    return jsonTradeValidationFailed(validation.errors);
  }

  const { marketId } = await context.params;

  try {
    const requestContext = await loadMarketRequestContext({
      marketId,
      unavailableMessage: tradeUnavailableMessage("quote"),
      requireAuthenticatedViewer: true,
    });
    if (!requestContext.ok) {
      return requestContext.response;
    }

    const detailResult = requireMarketDetail({
      detail: requestContext.context.detail,
      guards: buildTradeDetailGuards("quote"),
    });
    if (!detailResult.ok) {
      return detailResult.response;
    }

    const market = detailResult.market;
    const viewer = requestContext.context.viewer;

    if (market.status !== "open") {
      return jsonTradeMarketNotOpen("quote");
    }

    if (market.viewerCanTrade === false) {
      return jsonTradeViewerIneligible("quote", market.viewerReadOnlyReason);
    }

    const quote = await quoteMarketTrade({
      marketId,
      side: validation.data.side,
      action: validation.data.action,
      shares: validation.data.shares,
      maxSlippageBps: validation.data.maxSlippageBps,
    });

    if (!quote.ok) {
      return jsonTradeEngineFailure(quote);
    }

    return Response.json({
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
    return jsonTradeUnhandled("quote", error);
  }
}
