import { NextResponse } from "next/server";

import { jsonInternalError } from "@/lib/api/http-errors";
import { loadMarketRequestContext, requireMarketDetail } from "@/lib/markets/request-context";

export async function GET(_request: Request, context: { params: Promise<{ marketId: string }> }) {
  const { marketId } = await context.params;

  try {
    const requestContext = await loadMarketRequestContext({
      marketId,
      unavailableMessage: "Market detail is unavailable: missing Supabase environment variables.",
      syncFinalizations: true,
    });
    if (!requestContext.ok) {
      return requestContext.response;
    }

    const detailResult = requireMarketDetail({
      detail: requestContext.context.detail,
      guards: {
        loginRequired: {
          status: 401,
          error: "Login required to view this market.",
          code: "LOGIN_REQUIRED",
        },
        institutionVerificationRequired: {
          status: 403,
          error: "Institution verification required to view this market.",
          code: "INSTITUTION_VERIFICATION_REQUIRED",
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
          error: "Unable to load market detail.",
          includeSourceMessage: true,
        },
      },
    });
    if (!detailResult.ok) {
      return detailResult.response;
    }

    return NextResponse.json({
      market: detailResult.market,
      viewer: requestContext.context.viewer,
    });
  } catch (error) {
    return jsonInternalError("Market detail failed.", error);
  }
}
