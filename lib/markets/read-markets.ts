import { createClient } from "@/lib/supabase/server";
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
  actionRequired: "create_account" | "account_ready";
};

export type MarketSourceDTO = {
  label: string;
  url: string;
  type: string;
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
  liquidityParameter: number;
  sources: MarketSourceDTO[];
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

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const MARKET_DISCOVERY_LIMIT = 120;

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

function normalizeAmmState(raw: MarketAmmStateRow | MarketAmmStateRow[] | null): MarketAmmStateRow | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

function normalizeTags(raw: string[] | null): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((tag) => typeof tag === "string" && tag.trim().length > 0);
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
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

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

  const { data, error } = await request;

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

  const { data, error } = await supabase
    .from("markets")
    .select(
      "id, question, description, resolves_yes_if, resolves_no_if, status, visibility, access_rules, creator_id, close_time, expected_resolution_time, created_at, fee_bps, tags, risk_flags, evidence_rules, dispute_rules, market_amm_state(liquidity_parameter, yes_shares, no_shares, last_price_yes, last_price_no), market_sources(source_label, source_url, source_type)"
    )
    .eq("id", marketId)
    .maybeSingle();

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

  const sourceRows = Array.isArray(row.market_sources) ? row.market_sources : [];

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
      liquidityParameter: Math.max(0, toNumber(ammState?.liquidity_parameter, 0)),
      sources: sourceRows.map((source) => ({
        label: source.source_label,
        url: source.source_url,
        type: source.source_type,
      })),
      actionRequired: viewer.isAuthenticated ? "account_ready" : "create_account",
    },
  };
}
