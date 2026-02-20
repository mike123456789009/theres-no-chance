import { NextResponse } from "next/server";

import { getMarketDetail, getMarketViewerContext } from "@/lib/markets/read-markets";
import { createServiceClient, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";
import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";

export async function GET(_request: Request, context: { params: Promise<{ marketId: string }> }) {
  if (!isSupabaseServerEnvConfigured()) {
    return NextResponse.json(
      {
        error: "Market detail is unavailable: missing Supabase environment variables.",
        missingEnv: getMissingSupabaseServerEnv(),
      },
      { status: 503 }
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

    const detail = await getMarketDetail({
      supabase,
      viewer,
      marketId,
    });

    if (detail.kind === "login_required") {
      return NextResponse.json(
        {
          error: "Login required to view this market.",
          code: "LOGIN_REQUIRED",
        },
        { status: 401 }
      );
    }

    if (detail.kind === "not_found") {
      return NextResponse.json(
        {
          error: "Market not found.",
        },
        { status: 404 }
      );
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
          error: "Unable to load market detail.",
          detail: detail.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      market: detail.market,
      viewer,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Market detail failed.",
        detail: error instanceof Error ? error.message : "Unknown server error.",
      },
      { status: 500 }
    );
  }
}
