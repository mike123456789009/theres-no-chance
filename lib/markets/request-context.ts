import { getServerEnvReadiness, getServiceEnvReadiness } from "@/lib/api/env-guards";
import { jsonEnvUnavailable, jsonError, jsonUnauthorized } from "@/lib/api/http-errors";
import {
  getMarketDetail,
  getMarketViewerContext,
  type MarketDetailDTO,
  type MarketDetailFetchResult,
  type MarketViewerContext,
} from "@/lib/markets/read-markets";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type MarketRequestContext = {
  marketId: string;
  supabase: SupabaseServerClient;
  viewer: MarketViewerContext;
  detail: MarketDetailFetchResult;
};

export type MarketRequestContextLoadOptions = {
  marketId: string;
  unavailableMessage: string;
  requireAuthenticatedViewer?: boolean;
  unauthorizedMessage?: string;
  syncFinalizations?: boolean;
};

export type MarketRequestContextLoadResult =
  | {
      ok: true;
      context: MarketRequestContext;
    }
  | {
      ok: false;
      response: Response;
    };

export type MarketDetailGuardSpec = {
  status: number;
  error: string;
  detail?: string;
  code?: string;
  includeSourceMessage?: boolean;
};

export type MarketDetailGuardConfig = {
  loginRequired: MarketDetailGuardSpec;
  institutionVerificationRequired: MarketDetailGuardSpec;
  notFound: MarketDetailGuardSpec;
  schemaMissing: MarketDetailGuardSpec;
  detailError: MarketDetailGuardSpec;
};

export type MarketDetailGuardResult =
  | {
      ok: true;
      market: MarketDetailDTO;
    }
  | {
      ok: false;
      response: Response;
    };

function toGuardResponse(spec: MarketDetailGuardSpec, sourceMessage?: string): Response {
  const detail =
    spec.includeSourceMessage && sourceMessage
      ? sourceMessage
      : spec.detail;

  return jsonError(spec.status, spec.error, {
    code: spec.code,
    detail,
  });
}

export function requireMarketDetail(options: {
  detail: MarketDetailFetchResult;
  guards: MarketDetailGuardConfig;
}): MarketDetailGuardResult {
  const { detail, guards } = options;

  if (detail.kind === "ok") {
    return {
      ok: true,
      market: detail.market,
    };
  }

  if (detail.kind === "login_required") {
    return {
      ok: false,
      response: toGuardResponse(guards.loginRequired),
    };
  }

  if (detail.kind === "institution_verification_required") {
    return {
      ok: false,
      response: toGuardResponse(guards.institutionVerificationRequired),
    };
  }

  if (detail.kind === "not_found") {
    return {
      ok: false,
      response: toGuardResponse(guards.notFound),
    };
  }

  if (detail.kind === "schema_missing") {
    return {
      ok: false,
      response: toGuardResponse(guards.schemaMissing, detail.message),
    };
  }

  return {
    ok: false,
    response: toGuardResponse(guards.detailError, detail.message),
  };
}

export async function loadMarketRequestContext(
  options: MarketRequestContextLoadOptions
): Promise<MarketRequestContextLoadResult> {
  const serverEnv = getServerEnvReadiness();
  if (!serverEnv.isConfigured) {
    return {
      ok: false,
      response: jsonEnvUnavailable(options.unavailableMessage, serverEnv.missingEnv),
    };
  }

  const serviceEnv = getServiceEnvReadiness();
  if (serviceEnv.isConfigured) {
    const service = createServiceClient();
    await service.rpc("sync_market_close_state", { p_market_id: options.marketId });
    await service.rpc("refresh_community_market_resolution_state", {
      p_market_id: options.marketId,
      p_resolution_window_hours: 24,
    });

    if (options.syncFinalizations) {
      await service.rpc("sync_due_community_finalizations", { p_actor_user_id: null });
    }
  }

  const supabase = await createClient();
  const viewer = await getMarketViewerContext(supabase);

  if (options.requireAuthenticatedViewer && (!viewer.isAuthenticated || !viewer.userId)) {
    return {
      ok: false,
      response: jsonUnauthorized(options.unauthorizedMessage),
    };
  }

  const detail = await getMarketDetail({
    supabase,
    viewer,
    marketId: options.marketId,
  });

  return {
    ok: true,
    context: {
      marketId: options.marketId,
      supabase,
      viewer,
      detail,
    },
  };
}
