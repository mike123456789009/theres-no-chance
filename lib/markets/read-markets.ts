import { createClient } from "@/lib/supabase/server";
import { MARKET_CARD_SHADOW_TONES, type MarketCardShadowTone } from "@/lib/markets/presentation";
import {
  DISCOVERABLE_MARKET_STATUSES,
  canViewerSeeMarket,
  marketAccessBadge,
  normalizeAccessRules,
  requiresAuthenticatedViewer,
} from "@/lib/markets/view-access";

export const MARKET_DISCOVERY_SORTS = ["closing_soon", "newest", "probability_high", "probability_low"] as const;
export const MARKET_DISCOVERY_ACCESS_FILTERS = ["all", "public", "institution"] as const;

export type MarketDiscoverySort = (typeof MARKET_DISCOVERY_SORTS)[number];
export type MarketDiscoveryAccessFilter = (typeof MARKET_DISCOVERY_ACCESS_FILTERS)[number];
export type MarketDiscoveryStatusFilter = "all" | (typeof DISCOVERABLE_MARKET_STATUSES)[number];

export type MarketViewerContext = {
  userId: string | null;
  isAuthenticated: boolean;
};

export type MarketDiscoveryQuery = {
  search: string;
  status: MarketDiscoveryStatusFilter;
  access: MarketDiscoveryAccessFilter;
  sort: MarketDiscoverySort;
};

export type MarketCardDTO = {
  id: string;
  question: string;
  status: string;
  closeTime: string;
  createdAt: string;
  tags: string[];
  accessBadge: string;
  accessRequiresLogin: boolean;
  priceYes: number;
  priceNo: number;
  poolShares: number;
  cardShadowTone: MarketCardShadowTone;
  actionRequired: "create_account" | "account_ready";
};

export type MarketSourceDTO = {
  label: string;
  url: string;
  type: string;
};

export type MarketDetailChartPointDTO = {
  timestamp: string;
  priceYes: number;
};

export type MarketViewerPositionDTO = {
  yesShares: number;
  noShares: number;
  totalShares: number;
  averageEntryPriceYes: number | null;
  averageEntryPriceNo: number | null;
  realizedPnl: number;
  markValue: number;
};

export type MarketDetailDTO = {
  id: string;
  question: string;
  description: string;
  resolvesYesIf: string;
  resolvesNoIf: string;
  status: string;
  visibility: string;
  accessBadge: string;
  accessRequiresLogin: boolean;
  closeTime: string;
  expectedResolutionTime: string | null;
  createdAt: string;
  feeBps: number;
  tags: string[];
  riskFlags: string[];
  evidenceRules: string | null;
  disputeRules: string | null;
  priceYes: number;
  priceNo: number;
  yesShares: number;
  noShares: number;
  poolShares: number;
  liquidityParameter: number;
  chartPoints: MarketDetailChartPointDTO[];
  viewerPosition: MarketViewerPositionDTO | null;
  sources: MarketSourceDTO[];
  cardShadowTone: MarketCardShadowTone;
  actionRequired: "create_account" | "account_ready";
};

export type MarketDetailFetchResult =
  | { kind: "ok"; market: MarketDetailDTO }
  | { kind: "login_required" }
  | { kind: "not_found" }
  | { kind: "schema_missing"; message: string }
  | { kind: "error"; message: string };

type MarketAmmStateRow = {
  last_price_yes: number | string | null;
  last_price_no: number | string | null;
  yes_shares: number | string | null;
  no_shares: number | string | null;
  liquidity_parameter?: number | string | null;
};

type MarketSourceRow = {
  source_label: string;
  source_url: string;
  source_type: string;
};

type MarketDiscoveryRow = {
  id: string;
  question: string;
  status: string;
  visibility: string;
  access_rules: Record<string, unknown> | null;
  creator_id: string;
  close_time: string;
  created_at: string;
  tags: string[] | null;
  market_amm_state: MarketAmmStateRow | MarketAmmStateRow[] | null;
};

type MarketDetailRow = {
  id: string;
  question: string;
  description: string;
  resolves_yes_if: string;
  resolves_no_if: string;
  status: string;
  visibility: string;
  access_rules: Record<string, unknown> | null;
  creator_id: string;
  close_time: string;
  expected_resolution_time: string | null;
  created_at: string;
  fee_bps: number;
  tags: string[] | null;
  risk_flags: string[] | null;
  evidence_rules: string | null;
  dispute_rules: string | null;
  market_amm_state: MarketAmmStateRow | MarketAmmStateRow[] | null;
  market_sources: MarketSourceRow[] | null;
};

type PositionRow = {
  yes_shares: number | string | null;
  no_shares: number | string | null;
  average_entry_price_yes: number | string | null;
  average_entry_price_no: number | string | null;
  realized_pnl: number | string | null;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const MARKET_DISCOVERY_LIMIT = 120;
const MARKET_DETAIL_CHART_POINTS = 9;

function isSchemaMissingError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("could not find the table 'public.markets'") ||
    normalized.includes("relation \"markets\" does not exist") ||
    normalized.includes("schema cache")
  );
}

function cleanText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
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

function toOptionalNumber(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function parseDateMs(value: string | null | undefined, fallbackMs: number): number {
  if (!value) return fallbackMs;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallbackMs;
}

function buildMarketDetailChartPoints(options: {
  createdAt: string;
  closeTime: string;
  expectedResolutionTime: string | null;
  priceYes: number;
}): MarketDetailChartPointDTO[] {
  const nowMs = Date.now();
  const createdMs = parseDateMs(options.createdAt, nowMs - 1000 * 60 * 60 * 24 * 7);
  const closeMs = parseDateMs(options.closeTime, nowMs + 1000 * 60 * 60 * 24 * 7);
  const resolutionMs = parseDateMs(options.expectedResolutionTime, closeMs);
  const endMs = Math.max(closeMs, resolutionMs, createdMs + 1000 * 60 * 60);
  const spanMs = Math.max(1, endMs - createdMs);

  return Array.from({ length: MARKET_DETAIL_CHART_POINTS }, (_, index) => {
    const ratio = index / (MARKET_DETAIL_CHART_POINTS - 1);
    const pointMs = createdMs + Math.round(spanMs * ratio);
    return {
      timestamp: new Date(pointMs).toISOString(),
      priceYes: options.priceYes,
    };
  });
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

function resolveCardShadowTone(accessRules: Record<string, unknown> | null, marketId: string): MarketCardShadowTone {
  const explicitTone =
    toCardShadowTone(accessRules?.cardShadowTone) ??
    toCardShadowTone(accessRules?.card_shadow_tone) ??
    toCardShadowTone(accessRules?.cardShadowColor) ??
    toCardShadowTone(accessRules?.card_shadow_color);

  return explicitTone ?? fallbackCardShadowToneFromId(marketId);
}

function parseSort(value: string): MarketDiscoverySort {
  if ((MARKET_DISCOVERY_SORTS as readonly string[]).includes(value)) {
    return value as MarketDiscoverySort;
  }
  return "closing_soon";
}

function parseAccess(value: string): MarketDiscoveryAccessFilter {
  if ((MARKET_DISCOVERY_ACCESS_FILTERS as readonly string[]).includes(value)) {
    return value as MarketDiscoveryAccessFilter;
  }
  return "all";
}

function parseStatus(value: string): MarketDiscoveryStatusFilter {
  if (value === "all") return "all";
  if ((DISCOVERABLE_MARKET_STATUSES as readonly string[]).includes(value)) {
    return value as MarketDiscoveryStatusFilter;
  }
  return "all";
}

function escapeIlikeValue(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function parseMarketDiscoveryQuery(searchParams: URLSearchParams): MarketDiscoveryQuery {
  return {
    search: cleanText(searchParams.get("q")).slice(0, 100),
    status: parseStatus(cleanText(searchParams.get("status")).toLowerCase()),
    access: parseAccess(cleanText(searchParams.get("access")).toLowerCase()),
    sort: parseSort(cleanText(searchParams.get("sort")).toLowerCase()),
  };
}

export function toUrlSearchParams(
  rawSearchParams: Record<string, string | string[] | undefined>
): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(rawSearchParams)) {
    if (Array.isArray(rawValue)) {
      const first = rawValue.find((item) => typeof item === "string" && item.trim().length > 0);
      if (first) params.set(key, first);
      continue;
    }

    if (typeof rawValue === "string" && rawValue.trim().length > 0) {
      params.set(key, rawValue);
    }
  }

  return params;
}

export async function getMarketViewerContext(
  supabase: SupabaseServerClient
): Promise<MarketViewerContext> {
  let user: { id: string } | null = null;
  let error: unknown = null;

  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
    error = result.error;
  } catch (caught) {
    error = caught;
  }

  if (error || !user) {
    return {
      userId: null,
      isAuthenticated: false,
    };
  }

  return {
    userId: user.id,
    isAuthenticated: true,
  };
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
      "id, question, status, visibility, access_rules, creator_id, close_time, created_at, tags, market_amm_state(last_price_yes, last_price_no, yes_shares, no_shares)"
    )
    .in("status", [...DISCOVERABLE_MARKET_STATUSES])
    .limit(MARKET_DISCOVERY_LIMIT);

  if (query.search) {
    request = request.ilike("question", `%${escapeIlikeValue(query.search)}%`);
  }

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

  const markets = rows
    .map((row) => {
      const accessRules = normalizeAccessRules(row.access_rules);
      const visibility = row.visibility;
      const accessRequiresLogin = requiresAuthenticatedViewer({
        visibility,
        accessRules,
      });

      const access = canViewerSeeMarket(
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

      if (query.access === "public" && accessRequiresLogin) {
        return null;
      }

      if (query.access === "institution" && !accessRequiresLogin) {
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
    .filter((market): market is MarketCardDTO => market !== null);

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

export async function getMarketDetail(options: {
  supabase: SupabaseServerClient;
  viewer: MarketViewerContext;
  marketId: string;
}): Promise<MarketDetailFetchResult> {
  const { supabase, viewer, marketId } = options;

  let data: unknown = null;
  let error: { message: string; code?: string } | null = null;

  try {
    const result = await supabase
      .from("markets")
      .select(
        "id, question, description, resolves_yes_if, resolves_no_if, status, visibility, access_rules, creator_id, close_time, expected_resolution_time, created_at, fee_bps, tags, risk_flags, evidence_rules, dispute_rules, market_amm_state(liquidity_parameter, yes_shares, no_shares, last_price_yes, last_price_no), market_sources(source_label, source_url, source_type)"
      )
      .eq("id", marketId)
      .maybeSingle();

    data = result.data;
    error = result.error;
  } catch (caught) {
    return {
      kind: "error",
      message: caught instanceof Error ? caught.message : "Unknown market detail error.",
    };
  }

  if (error) {
    if (error.code === "PGRST116") {
      return { kind: "not_found" };
    }

    if (isSchemaMissingError(error.message)) {
      return {
        kind: "schema_missing",
        message: error.message,
      };
    }

    return {
      kind: "error",
      message: error.message,
    };
  }

  if (!data) {
    return { kind: "not_found" };
  }

  const row = data as MarketDetailRow;
  const accessRules = normalizeAccessRules(row.access_rules);

  const access = canViewerSeeMarket(
    {
      status: row.status,
      visibility: row.visibility,
      creatorId: row.creator_id,
      accessRules,
    },
    viewer
  );

  if (!access.allowed) {
    if (access.reason === "login_required") {
      return { kind: "login_required" };
    }

    return { kind: "not_found" };
  }

  const ammState = normalizeAmmState(row.market_amm_state);
  const priceYes = clamp(toNumber(ammState?.last_price_yes, 0.5), 0, 1);
  const explicitPriceNo = clamp(toNumber(ammState?.last_price_no, 1 - priceYes), 0, 1);
  const priceNo = clamp(explicitPriceNo || 1 - priceYes, 0, 1);
  const yesShares = Math.max(0, toNumber(ammState?.yes_shares, 0));
  const noShares = Math.max(0, toNumber(ammState?.no_shares, 0));
  const poolShares = yesShares + noShares;

  const sourceRows = Array.isArray(row.market_sources) ? row.market_sources : [];
  const chartPoints = buildMarketDetailChartPoints({
    createdAt: row.created_at,
    closeTime: row.close_time,
    expectedResolutionTime: row.expected_resolution_time,
    priceYes,
  });

  let viewerPosition: MarketViewerPositionDTO | null = null;

  if (viewer.isAuthenticated && viewer.userId) {
    try {
      const { data: positionData, error: positionError } = await supabase
        .from("positions")
        .select("yes_shares, no_shares, average_entry_price_yes, average_entry_price_no, realized_pnl")
        .eq("market_id", marketId)
        .eq("user_id", viewer.userId)
        .maybeSingle();

      if (!positionError && positionData) {
        const position = positionData as PositionRow;
        const positionYesShares = Math.max(0, toNumber(position.yes_shares, 0));
        const positionNoShares = Math.max(0, toNumber(position.no_shares, 0));
        const positionTotalShares = positionYesShares + positionNoShares;

        viewerPosition = {
          yesShares: positionYesShares,
          noShares: positionNoShares,
          totalShares: positionTotalShares,
          averageEntryPriceYes: toOptionalNumber(position.average_entry_price_yes),
          averageEntryPriceNo: toOptionalNumber(position.average_entry_price_no),
          realizedPnl: toNumber(position.realized_pnl, 0),
          markValue: positionYesShares * priceYes + positionNoShares * priceNo,
        };
      }
    } catch {
      viewerPosition = null;
    }
  }

  return {
    kind: "ok",
    market: {
      id: row.id,
      question: row.question,
      description: row.description,
      resolvesYesIf: row.resolves_yes_if,
      resolvesNoIf: row.resolves_no_if,
      status: row.status,
      visibility: row.visibility,
      accessBadge: marketAccessBadge(row.visibility, accessRules),
      accessRequiresLogin: requiresAuthenticatedViewer({ visibility: row.visibility, accessRules }),
      closeTime: row.close_time,
      expectedResolutionTime: row.expected_resolution_time,
      createdAt: row.created_at,
      feeBps: row.fee_bps,
      tags: normalizeTags(row.tags),
      riskFlags: normalizeTags(row.risk_flags),
      evidenceRules: row.evidence_rules,
      disputeRules: row.dispute_rules,
      priceYes,
      priceNo,
      yesShares,
      noShares,
      poolShares,
      liquidityParameter: Math.max(0, toNumber(ammState?.liquidity_parameter, 0)),
      chartPoints,
      viewerPosition,
      sources: sourceRows.map((source) => ({
        label: source.source_label,
        url: source.source_url,
        type: source.source_type,
      })),
      cardShadowTone: resolveCardShadowTone(accessRules, row.id),
      actionRequired: viewer.isAuthenticated ? "account_ready" : "create_account",
    },
  };
}
