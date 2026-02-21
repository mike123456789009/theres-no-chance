import { NextResponse } from "next/server";

import { getServerEnvReadiness, getServiceEnvReadiness } from "@/lib/api/env-guards";
import { jsonEnvUnavailable, jsonInternalError, jsonError } from "@/lib/api/http-errors";
import { getMarketDetail, getMarketViewerContext } from "@/lib/markets/read-markets";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, context: { params: Promise<{ marketId: string }> }) {
  const serverEnv = getServerEnvReadiness();
  if (!serverEnv.isConfigured) {
    return jsonEnvUnavailable("Market detail is unavailable: missing Supabase environment variables.", serverEnv.missingEnv);
  }

  const { marketId } = await context.params;

  try {
    const serviceEnv = getServiceEnvReadiness();
    if (serviceEnv.isConfigured) {
      const service = createServiceClient();
      await service.rpc("sync_market_close_state", { p_market_id: marketId });
      await service.rpc("refresh_community_market_resolution_state", {
        p_market_id: marketId,
        p_resolution_window_hours: 24,
      });
      await service.rpc("sync_due_community_finalizations", { p_actor_user_id: null });
    }

    const supabase = await createClient();
    const viewer = await getMarketViewerContext(supabase);

    const detail = await getMarketDetail({
      supabase,
      viewer,
      marketId,
    });

    if (detail.kind === "login_required") {
      return jsonError(401, "Login required to view this market.", { code: "LOGIN_REQUIRED" });
    }

    if (detail.kind === "institution_verification_required") {
      return jsonError(403, "Institution verification required to view this market.", {
        code: "INSTITUTION_VERIFICATION_REQUIRED",
      });
    }

    if (detail.kind === "not_found") {
      return jsonError(404, "Market not found.");
    }

    if (detail.kind === "schema_missing") {
      return jsonError(503, "Market tables are not provisioned in this environment yet.", { detail: detail.message });
    }

    if (detail.kind === "error") {
      return jsonError(500, "Unable to load market detail.", { detail: detail.message });
    }

    return NextResponse.json({
      market: detail.market,
      viewer,
    });
  } catch (error) {
    return jsonInternalError("Market detail failed.", error);
  }
}
