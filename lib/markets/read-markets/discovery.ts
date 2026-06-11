import { createServiceClient, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";
import {
  DISCOVERABLE_MARKET_STATUSES,
  canViewerDiscoverMarket,
  hasInstitutionAccessRule,
  marketAccessBadge,
  normalizeAccessRules,
  requiresAuthenticatedViewer,
} from "@/lib/markets/view-access";

import { shouldIncludeForCategory, shouldIncludeForSearch } from "./query";
import {
  isMarketSchemaMissingError,
  normalizeTags,
  resolveAmmSnapshot,
  resolveCardShadowTone,
} from "./mappers";
import {
  MARKET_DISCOVERY_LIMIT,
  type MarketCardDTO,
  type MarketDiscoveryQuery,
  type MarketDiscoveryRow,
  type MarketViewerContext,
  type SupabaseServerClient,
} from "./types";

function toTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareByVolumeThenAgeDesc(a: MarketCardDTO, b: MarketCardDTO): number {
  if (b.poolShares !== a.poolShares) {
    return b.poolShares - a.poolShares;
  }

  return toTimestamp(b.createdAt) - toTimestamp(a.createdAt);
}

export async function listDiscoveryMarketCards(options: {
  supabase: SupabaseServerClient;
  viewer: MarketViewerContext;
  query: MarketDiscoveryQuery;
}): Promise<{ markets: MarketCardDTO[]; error: string | null; schemaMissing: boolean }> {
  const { supabase, viewer, query } = options;

  let request = supabase
    .from("markets")
    .select(
      "id, question, status, resolution_mode, resolution_outcome, finalized_at, void_reason, adjudication_required, visibility, access_rules, creator_id, close_time, created_at, tags, market_amm_state(last_price_yes, last_price_no, yes_shares, no_shares)"
    )
    .in("status", [...DISCOVERABLE_MARKET_STATUSES])
    .limit(MARKET_DISCOVERY_LIMIT);

  if (query.status !== "all") {
    request = request.eq("status", query.status);
  }

  if (query.sort === "newest" || query.sort === "volume") {
    request = request.order("created_at", { ascending: false });
  } else {
    request = request.order("close_time", { ascending: true });
  }

  let data: unknown = null;
  let error: { message: string } | null = null;

  try {
    const result = await request;
    data = result.data;
    error = result.error;
  } catch (caught) {
    return {
      markets: [],
      error: caught instanceof Error ? caught.message : "Unknown market discovery error.",
      schemaMissing: false,
    };
  }

  if (error) {
    return {
      markets: [],
      error: error.message,
      schemaMissing: isMarketSchemaMissingError(error.message),
    };
  }

  const rows = (data ?? []) as MarketDiscoveryRow[];

  if (viewer.isAuthenticated && !viewer.hasActiveInstitution && isSupabaseServiceEnvConfigured()) {
    try {
      const service = createServiceClient();
      let serviceRequest = service
        .from("markets")
        .select(
          "id, question, status, resolution_mode, resolution_outcome, finalized_at, void_reason, adjudication_required, visibility, access_rules, creator_id, close_time, created_at, tags, market_amm_state(last_price_yes, last_price_no, yes_shares, no_shares)"
        )
        .in("status", [...DISCOVERABLE_MARKET_STATUSES])
        .limit(MARKET_DISCOVERY_LIMIT);

      if (query.status !== "all") {
        serviceRequest = serviceRequest.eq("status", query.status);
      }

      if (query.sort === "newest" || query.sort === "volume") {
        serviceRequest = serviceRequest.order("created_at", { ascending: false });
      } else {
        serviceRequest = serviceRequest.order("close_time", { ascending: true });
      }

      const { data: serviceRows, error: serviceError } = await serviceRequest;
      if (!serviceError) {
        const seenIds = new Set(rows.map((row) => row.id));
        for (const row of (serviceRows ?? []) as MarketDiscoveryRow[]) {
          const accessRules = normalizeAccessRules(row.access_rules);
          if (!hasInstitutionAccessRule(accessRules)) continue;
          if (seenIds.has(row.id)) continue;
          rows.push(row);
          seenIds.add(row.id);
        }
      }
    } catch {
      // If service-role discovery merge fails, keep baseline RLS-filtered result.
    }
  }

  const nowMs = Date.now();

  const markets = rows
    .map((row) => {
      const accessRules = normalizeAccessRules(row.access_rules);
      const visibility = row.visibility;
      const institutionMarket = hasInstitutionAccessRule(accessRules);
      const accessRequiresLogin = requiresAuthenticatedViewer({
        visibility,
        accessRules,
      });

      const access = canViewerDiscoverMarket(
        {
          status: row.status,
          visibility,
          creatorId: row.creator_id,
          accessRules,
        },
        viewer
      );

      if (!access.allowed) {
        return null;
      }

      if (query.access === "public" && institutionMarket) {
        return null;
      }

      if (query.access === "institution" && !institutionMarket) {
        return null;
      }

      const { priceYes, priceNo, poolShares } = resolveAmmSnapshot(row.market_amm_state);

      return {
        id: row.id,
        question: row.question,
        status: row.status,
        resolutionMode: row.resolution_mode,
        resolutionOutcome: row.resolution_outcome,
        finalizedAt: row.finalized_at,
        voidReason: row.void_reason,
        adjudicationRequired: row.adjudication_required === true,
        openChallengeCount: 0,
        closeTime: row.close_time,
        createdAt: row.created_at,
        tags: normalizeTags(row.tags),
        accessBadge: marketAccessBadge(visibility, accessRules),
        accessRequiresLogin,
        priceYes,
        priceNo,
        poolShares,
        cardShadowTone: resolveCardShadowTone(accessRules, row.id),
        actionRequired: viewer.isAuthenticated ? "account_ready" : "create_account",
      } as MarketCardDTO;
    })
    .filter((market): market is MarketCardDTO => market !== null)
    .filter((market) => shouldIncludeForCategory({ category: query.category, market, nowMs }))
    .filter((market) => shouldIncludeForSearch(market, query.search));

  if (query.sort === "volume") {
    markets.sort(compareByVolumeThenAgeDesc);
  }

  if (query.sort === "probability_high") {
    markets.sort((a, b) => b.priceYes - a.priceYes);
  }

  if (query.sort === "probability_low") {
    markets.sort((a, b) => a.priceYes - b.priceYes);
  }

  return {
    markets,
    error: null,
    schemaMissing: false,
  };
}
