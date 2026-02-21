import type { MarketAccessRules } from "@/lib/markets/access-rules";
import { MARKET_CARD_SHADOW_TONES, type MarketCardShadowTone } from "@/lib/markets/presentation";
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
  MARKET_DISCOVERY_LIMIT,
  type MarketAmmStateRow,
  type MarketCardDTO,
  type MarketDiscoveryQuery,
  type MarketDiscoveryRow,
  type MarketViewerContext,
  type SupabaseServerClient,
} from "./types";

function isSchemaMissingError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("could not find the table 'public.markets'") ||
    normalized.includes('relation "markets" does not exist') ||
    normalized.includes("schema cache")
  );
}

function toNumber(value: number | string | null | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeAmmState(raw: MarketAmmStateRow | MarketAmmStateRow[] | null): MarketAmmStateRow | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

function normalizeTags(raw: string[] | null): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((tag) => typeof tag === "string" && tag.trim().length > 0);
}

function hashId(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function fallbackCardShadowToneFromId(marketId: string): MarketCardShadowTone {
  const toneIndex = hashId(marketId) % MARKET_CARD_SHADOW_TONES.length;
  return MARKET_CARD_SHADOW_TONES[toneIndex];
}

function toCardShadowTone(value: unknown): MarketCardShadowTone | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if ((MARKET_CARD_SHADOW_TONES as readonly string[]).includes(normalized)) {
    return normalized as MarketCardShadowTone;
  }
  return null;
}

function resolveCardShadowTone(accessRules: MarketAccessRules, marketId: string): MarketCardShadowTone {
  const explicitTone =
    toCardShadowTone(accessRules.cardShadowTone) ??
    toCardShadowTone(accessRules.cardShadowColor);

  return explicitTone ?? fallbackCardShadowToneFromId(marketId);
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
      "id, question, status, resolution_mode, visibility, access_rules, creator_id, close_time, created_at, tags, market_amm_state(last_price_yes, last_price_no, yes_shares, no_shares)"
    )
    .in("status", [...DISCOVERABLE_MARKET_STATUSES])
    .limit(MARKET_DISCOVERY_LIMIT);

  if (query.status !== "all") {
    request = request.eq("status", query.status);
  }

  if (query.sort === "newest") {
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
      schemaMissing: isSchemaMissingError(error.message),
    };
  }

  const rows = (data ?? []) as MarketDiscoveryRow[];

  if (viewer.isAuthenticated && !viewer.hasActiveInstitution && isSupabaseServiceEnvConfigured()) {
    try {
      const service = createServiceClient();
      let serviceRequest = service
        .from("markets")
        .select(
          "id, question, status, resolution_mode, visibility, access_rules, creator_id, close_time, created_at, tags, market_amm_state(last_price_yes, last_price_no, yes_shares, no_shares)"
        )
        .in("status", [...DISCOVERABLE_MARKET_STATUSES])
        .limit(MARKET_DISCOVERY_LIMIT);

      if (query.status !== "all") {
        serviceRequest = serviceRequest.eq("status", query.status);
      }

      if (query.sort === "newest") {
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

      const ammState = normalizeAmmState(row.market_amm_state);
      const priceYes = clamp(toNumber(ammState?.last_price_yes, 0.5), 0, 1);
      const explicitPriceNo = clamp(toNumber(ammState?.last_price_no, 1 - priceYes), 0, 1);
      const priceNo = clamp(explicitPriceNo || 1 - priceYes, 0, 1);
      const yesShares = Math.max(0, toNumber(ammState?.yes_shares, 0));
      const noShares = Math.max(0, toNumber(ammState?.no_shares, 0));

      return {
        id: row.id,
        question: row.question,
        status: row.status,
        resolutionMode: row.resolution_mode,
        closeTime: row.close_time,
        createdAt: row.created_at,
        tags: normalizeTags(row.tags),
        accessBadge: marketAccessBadge(visibility, accessRules),
        accessRequiresLogin,
        priceYes,
        priceNo,
        poolShares: yesShares + noShares,
        cardShadowTone: resolveCardShadowTone(accessRules, row.id),
        actionRequired: viewer.isAuthenticated ? "account_ready" : "create_account",
      } as MarketCardDTO;
    })
    .filter((market): market is MarketCardDTO => market !== null)
    .filter((market) => shouldIncludeForCategory({ category: query.category, market, nowMs }))
    .filter((market) => shouldIncludeForSearch(market, query.search));

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
