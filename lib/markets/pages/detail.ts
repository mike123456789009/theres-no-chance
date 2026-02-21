import {
  getMarketDetail,
  getMarketViewerContext,
  type MarketDetailDTO,
  type MarketViewerContext,
} from "@/lib/markets/read-markets";
import { createServiceClient, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";
import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";

type DetailPageDependencies = {
  isSupabaseServerEnvConfigured: typeof isSupabaseServerEnvConfigured;
  getMissingSupabaseServerEnv: typeof getMissingSupabaseServerEnv;
  isSupabaseServiceEnvConfigured: typeof isSupabaseServiceEnvConfigured;
  createServiceClient: typeof createServiceClient;
  createClient: typeof createClient;
  getMarketViewerContext: typeof getMarketViewerContext;
  getMarketDetail: typeof getMarketDetail;
};

const DEFAULT_DETAIL_PAGE_DEPENDENCIES: DetailPageDependencies = {
  isSupabaseServerEnvConfigured,
  getMissingSupabaseServerEnv,
  isSupabaseServiceEnvConfigured,
  createServiceClient,
  createClient,
  getMarketViewerContext,
  getMarketDetail,
};

export type DetailPageLoadResult =
  | { kind: "env_missing"; missingEnv: string[] }
  | { kind: "not_found" }
  | { kind: "schema_missing"; message: string }
  | { kind: "error"; message: string }
  | { kind: "login_required" }
  | { kind: "institution_verification_required" }
  | { kind: "ready"; marketId: string; viewer: MarketViewerContext; market: MarketDetailDTO };

export async function loadDetailPageData(options: {
  marketId: string;
  dependencies?: Partial<DetailPageDependencies>;
}): Promise<DetailPageLoadResult> {
  const dependencies = {
    ...DEFAULT_DETAIL_PAGE_DEPENDENCIES,
    ...options.dependencies,
  };

  if (!dependencies.isSupabaseServerEnvConfigured()) {
    return {
      kind: "env_missing",
      missingEnv: dependencies.getMissingSupabaseServerEnv(),
    };
  }

  if (dependencies.isSupabaseServiceEnvConfigured()) {
    const service = dependencies.createServiceClient();
    await service.rpc("sync_market_close_state", { p_market_id: options.marketId });
    await service.rpc("refresh_community_market_resolution_state", {
      p_market_id: options.marketId,
      p_resolution_window_hours: 24,
    });
    await service.rpc("sync_due_community_finalizations", { p_actor_user_id: null });
  }

  const supabase = await dependencies.createClient();
  const viewer = await dependencies.getMarketViewerContext(supabase);
  const detail = await dependencies.getMarketDetail({
    supabase,
    viewer,
    marketId: options.marketId,
  });

  if (detail.kind === "not_found") {
    return { kind: "not_found" };
  }

  if (detail.kind === "schema_missing") {
    return {
      kind: "schema_missing",
      message: detail.message,
    };
  }

  if (detail.kind === "error") {
    return {
      kind: "error",
      message: detail.message,
    };
  }

  if (detail.kind === "login_required") {
    return { kind: "login_required" };
  }

  if (detail.kind === "institution_verification_required") {
    return { kind: "institution_verification_required" };
  }

  return {
    kind: "ready",
    marketId: options.marketId,
    viewer,
    market: detail.market,
  };
}
