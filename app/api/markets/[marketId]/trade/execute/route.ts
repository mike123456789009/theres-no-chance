import { loadMarketRequestContext, requireMarketDetail } from "@/lib/markets/request-context";
import {
  buildTradeDetailGuards,
  jsonTradeEngineFailure,
  jsonTradeMarketNotOpen,
  jsonTradeUnhandled,
  jsonTradeValidationFailed,
  jsonTradeViewerIneligible,
  normalizeExecutePayloadWithIdempotencyKey,
  parseTradeJsonBody,
  tradeUnavailableMessage,
} from "@/lib/markets/trade/http";
import { executeMarketTrade, validateTradeExecutePayload } from "@/lib/markets/trade-engine";

export async function POST(request: Request, context: { params: Promise<{ marketId: string }> }) {
  const parsedBody = await parseTradeJsonBody(request);
  if (!parsedBody.ok) {
    return parsedBody.response;
  }

  const payloadWithIdempotency = normalizeExecutePayloadWithIdempotencyKey(
    parsedBody.payload,
    request.headers
  );

  const validation = validateTradeExecutePayload(payloadWithIdempotency);
  if (!validation.ok) {
    return jsonTradeValidationFailed(validation.errors);
  }

  const { marketId } = await context.params;

  try {
    const requestContext = await loadMarketRequestContext({
      marketId,
      unavailableMessage: tradeUnavailableMessage("execution"),
      requireAuthenticatedViewer: true,
    });
    if (!requestContext.ok) {
      return requestContext.response;
    }

    const detailResult = requireMarketDetail({
      detail: requestContext.context.detail,
      guards: buildTradeDetailGuards("execution"),
    });
    if (!detailResult.ok) {
      return detailResult.response;
    }

    const market = detailResult.market;
    const viewer = requestContext.context.viewer;
    const userId = viewer.userId;
    if (!userId) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    if (market.status !== "open") {
      return jsonTradeMarketNotOpen("execution");
    }

    if (market.viewerCanTrade === false) {
      return jsonTradeViewerIneligible("execution", market.viewerReadOnlyReason);
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
      return jsonTradeEngineFailure(execution);
    }

    return Response.json(
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
    return jsonTradeUnhandled("execution", error);
  }
}
