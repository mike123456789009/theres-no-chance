import { createClient } from "@/lib/supabase/server";
import type { MarketAccessRules } from "@/lib/markets/access-rules";
import { MARKET_CARD_SHADOW_TONES, type MarketCardShadowTone } from "@/lib/markets/presentation";
import { MARKET_CATEGORY_KEYS, MARKET_CATEGORY_SEARCH_QUERY, type MarketCategoryKey } from "@/lib/markets/taxonomy";
import { createServiceClient, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";
import {
  DISCOVERABLE_MARKET_STATUSES,
  canViewerAccessMarketDetail,
  canViewerDiscoverMarket,
  hasInstitutionAccessRule,
  marketAccessBadge,
  normalizeAccessRules,
  requiresAuthenticatedViewer,
} from "@/lib/markets/view-access";

export const MARKET_DISCOVERY_SORTS = ["closing_soon", "newest", "probability_high", "probability_low"] as const;
export const MARKET_DISCOVERY_ACCESS_FILTERS = ["all", "public", "institution"] as const;

export type MarketDiscoverySort = (typeof MARKET_DISCOVERY_SORTS)[number];
export type MarketDiscoveryAccessFilter = (typeof MARKET_DISCOVERY_ACCESS_FILTERS)[number];
export type MarketDiscoveryStatusFilter = "all" | (typeof DISCOVERABLE_MARKET_STATUSES)[number];
export type MarketDiscoveryCategoryFilter = MarketCategoryKey;

export type MarketViewerContext = {
  userId: string | null;
  isAuthenticated: boolean;
  activeOrganizationId: string | null;
  hasActiveInstitution: boolean;
};

export type MarketDiscoveryQuery = {
  search: string;
  category: MarketDiscoveryCategoryFilter;
  status: MarketDiscoveryStatusFilter;
  access: MarketDiscoveryAccessFilter;
  sort: MarketDiscoverySort;
};

export type MarketCardDTO = {
  id: string;
  question: string;
  status: string;
  resolutionMode: string;
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

export type MarketEvidenceDTO = {
  id: string;
  submittedBy: string;
  evidenceUrl: string | null;
  evidenceText: string | null;
  notes: string | null;
  submittedOutcome: string | null;
  createdAt: string;
};

export type MarketResolverPrizeContributionDTO = {
  id: string;
  contributorId: string;
  amount: number;
  status: string;
  createdAt: string;
};

export type ViewerResolverBondDTO = {
  id: string;
  outcome: string;
  bondAmount: number;
  createdAt: string;
};

export type ViewerChallengeDTO = {
  id: string;
  status: string;
  challengeBondAmount: number;
  proposedOutcome: string | null;
  reason: string;
  createdAt: string;
  expiresAt: string | null;
};

export type MarketDetailDTO = {
  id: string;
  question: string;
  description: string;
  resolvesYesIf: string;
  resolvesNoIf: string;
  status: string;
  resolutionMode: string;
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
  resolutionOutcome: string | null;
  provisionalOutcome: string | null;
  resolvedAt: string | null;
  provisionalResolvedAt: string | null;
  finalizedAt: string | null;
  resolutionWindowEndsAt: string | null;
  challengeWindowEndsAt: string | null;
  adjudicationRequired: boolean;
  adjudicationReason: string | null;
  voidReason: string | null;
  challengeBonusRate: number;
  challengeBondAmount: number;
  listingFeeAmount: number;
  creatorRakePaidAmount: number;
  creatorRakePaidAt: string | null;
  finalOutcomeChangedByChallenge: boolean;
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
  viewerCanTrade: boolean;
  viewerReadOnlyReason: "legacy_institution_access" | null;
  resolverStakeCap: number;
  yesBondTotal: number;
  noBondTotal: number;
  challengeCount: number;
  openChallengeCount: number;
  viewerResolverBond: ViewerResolverBondDTO | null;
  viewerChallenge: ViewerChallengeDTO | null;
  viewerCanResolve: boolean;
  viewerCanChallenge: boolean;
  evidence: MarketEvidenceDTO[];
  resolverPrizeLockedTotal: number;
  resolverPrizeContributionCount: number;
  resolverPrizeRecentContributions: MarketResolverPrizeContributionDTO[];
};

export type MarketDetailFetchResult =
  | { kind: "ok"; market: MarketDetailDTO }
  | { kind: "login_required" }
  | { kind: "institution_verification_required" }
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
  resolution_mode: string;
  visibility: string;
  access_rules: unknown;
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
  resolution_mode: string;
  visibility: string;
  access_rules: unknown;
  creator_id: string;
  close_time: string;
  expected_resolution_time: string | null;
  created_at: string;
  fee_bps: number;
  tags: string[] | null;
  risk_flags: string[] | null;
  evidence_rules: string | null;
  dispute_rules: string | null;
  resolution_outcome: string | null;
  provisional_outcome: string | null;
  resolved_at: string | null;
  provisional_resolved_at: string | null;
  finalized_at: string | null;
  resolution_window_ends_at: string | null;
  challenge_window_ends_at: string | null;
  adjudication_required: boolean | null;
  adjudication_reason: string | null;
  void_reason: string | null;
  challenge_bonus_rate: number | string | null;
  challenge_bond_amount: number | string | null;
  listing_fee_amount: number | string | null;
  creator_rake_paid_amount: number | string | null;
  creator_rake_paid_at: string | null;
  final_outcome_changed_by_challenge: boolean | null;
  market_amm_state: MarketAmmStateRow | MarketAmmStateRow[] | null;
  market_sources: MarketSourceRow[] | null;
};

type ResolverBondRow = {
  id: string;
  user_id: string;
  outcome: string;
  bond_amount: number | string | null;
  created_at: string;
};

type ChallengeRow = {
  id: string;
  created_by: string;
  status: string;
  challenge_bond_amount: number | string | null;
  proposed_outcome: string | null;
  reason: string;
  created_at: string;
  expires_at: string | null;
};

type EvidenceRow = {
  id: string;
  submitted_by: string;
  evidence_url: string | null;
  evidence_text: string | null;
  notes: string | null;
  submitted_outcome: string | null;
  created_at: string;
};

type ResolverPrizeContributionRow = {
  id: string;
  contributor_id: string;
  amount: number | string | null;
  status: string;
  created_at: string;
};

type PositionRow = {
  yes_shares: number | string | null;
  no_shares: number | string | null;
  average_entry_price_yes: number | string | null;
  average_entry_price_no: number | string | null;
  realized_pnl: number | string | null;
};

type ActiveMembershipRow = {
  organization_id: string;
} | null;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const MARKET_DISCOVERY_LIMIT = 120;
const MARKET_DETAIL_CHART_POINTS = 9;
const NEW_MARKET_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const CATEGORY_MATCH_TERMS: Record<Exclude<MarketCategoryKey, "trending" | "new">, string[]> = {
  politics: ["politics", "election", "vote", "government", "policy", "senate", "congress", "president", "white-house"],
  sports: ["sports", "sport", "match", "game", "tournament", "playoff", "league", "olympic", "paralympic"],
  crypto: ["crypto", "bitcoin", "ethereum", "solana", "token", "blockchain", "defi", "btc", "eth"],
  finance: ["finance", "market", "stocks", "fed", "rate", "treasury", "earnings", "cpi", "inflation", "macro"],
  geopolitics: ["geopolitics", "war", "conflict", "diplomacy", "sanction", "treaty", "nato", "china", "russia"],
  tech: ["tech", "technology", "ai", "artificial intelligence", "software", "hardware", "semiconductor", "startup"],
  culture: ["culture", "entertainment", "film", "music", "awards", "media", "celebrity", "tv"],
  world: ["world", "global", "international", "foreign", "europe", "asia", "africa", "middle east", "latam"],
  economy: ["economy", "economic", "gdp", "unemployment", "jobs", "recession", "consumer", "trade"],
  climate_science: ["climate", "science", "weather", "temperature", "emissions", "environment", "hurricane", "el nino"],
};

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

function resolveCardShadowTone(accessRules: MarketAccessRules, marketId: string): MarketCardShadowTone {
  const explicitTone =
    toCardShadowTone(accessRules.cardShadowTone) ??
    toCardShadowTone(accessRules.cardShadowColor);

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

function parseCategory(value: string): MarketDiscoveryCategoryFilter {
  if ((MARKET_CATEGORY_KEYS as readonly string[]).includes(value)) {
    return value as MarketDiscoveryCategoryFilter;
  }
  return "trending";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsCategoryTerm(text: string, term: string): boolean {
  if (!text || !term) return false;

  if (term.includes(" ") || term.includes("-")) {
    return text.includes(term);
  }

  if (term.length <= 3) {
    const matcher = new RegExp(`\\b${escapeRegex(term)}\\b`, "i");
    return matcher.test(text);
  }

  return text.includes(term);
}

function inferLegacyCategoryFromSearch(search: string): MarketDiscoveryCategoryFilter | null {
  if (!search) return null;

  const normalized = search.trim().toLowerCase();
  for (const [category, query] of Object.entries(MARKET_CATEGORY_SEARCH_QUERY) as Array<
    [MarketCategoryKey, string | undefined]
  >) {
    if (!query) continue;
    if (query.toLowerCase() === normalized) {
      return category;
    }
  }

  return null;
}

function shouldIncludeForCategory(options: {
  category: MarketDiscoveryCategoryFilter;
  market: MarketCardDTO;
  nowMs: number;
}): boolean {
  const { category, market, nowMs } = options;

  if (category === "trending") {
    return true;
  }

  if (category === "new") {
    const createdMs = Date.parse(market.createdAt);
    if (!Number.isFinite(createdMs)) return false;
    return nowMs - createdMs <= NEW_MARKET_WINDOW_MS;
  }

  const matchTerms = CATEGORY_MATCH_TERMS[category];
  const tags = market.tags.map((tag) => tag.toLowerCase());
  const question = market.question.toLowerCase();

  return matchTerms.some((term) => {
    if (containsCategoryTerm(question, term)) return true;
    return tags.some((tag) => containsCategoryTerm(tag, term));
  });
}

function shouldIncludeForSearch(market: MarketCardDTO, rawSearch: string): boolean {
  const normalizedSearch = rawSearch.trim().toLowerCase();
  if (!normalizedSearch) return true;

  const haystack = `${market.question.toLowerCase()} ${market.tags.join(" ").toLowerCase()}`;
  const tokens = normalizedSearch.split(/\s+/).filter((token) => token.length > 0);

  return tokens.every((token) => haystack.includes(token));
}

function escapeIlikeValue(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function parseMarketDiscoveryQuery(searchParams: URLSearchParams): MarketDiscoveryQuery {
  const rawSearch = cleanText(searchParams.get("q")).slice(0, 100);
  const parsedCategory = parseCategory(cleanText(searchParams.get("category")).toLowerCase());
  const legacyCategory = inferLegacyCategoryFromSearch(rawSearch);
  const category = parsedCategory !== "trending" ? parsedCategory : legacyCategory ?? "trending";
  const search = category === (legacyCategory ?? "") ? "" : rawSearch;

  return {
    search,
    category,
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
      activeOrganizationId: null,
      hasActiveInstitution: false,
    };
  }

  let activeOrganizationId: string | null = null;

  try {
    const { data: membershipData, error: membershipError } = await supabase
      .from("organization_memberships")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("verified_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!membershipError) {
      const membership = (membershipData ?? null) as ActiveMembershipRow;
      activeOrganizationId = cleanText(membership?.organization_id).toLowerCase() || null;
    }
  } catch {
    activeOrganizationId = null;
  }

  return {
    userId: user.id,
    isAuthenticated: true,
    activeOrganizationId,
    hasActiveInstitution: Boolean(activeOrganizationId),
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
        "id, question, description, resolves_yes_if, resolves_no_if, status, resolution_mode, visibility, access_rules, creator_id, close_time, expected_resolution_time, created_at, fee_bps, tags, risk_flags, evidence_rules, dispute_rules, resolution_outcome, provisional_outcome, resolved_at, provisional_resolved_at, finalized_at, resolution_window_ends_at, challenge_window_ends_at, adjudication_required, adjudication_reason, void_reason, challenge_bonus_rate, challenge_bond_amount, listing_fee_amount, creator_rake_paid_amount, creator_rake_paid_at, final_outcome_changed_by_challenge, market_amm_state(liquidity_parameter, yes_shares, no_shares, last_price_yes, last_price_no), market_sources(source_label, source_url, source_type)"
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
    if ((!viewer.isAuthenticated || !viewer.hasActiveInstitution) && isSupabaseServiceEnvConfigured()) {
      try {
        const service = createServiceClient();
        const { data: serviceData, error: serviceError } = await service
          .from("markets")
          .select("id, status, visibility, access_rules, creator_id")
          .eq("id", marketId)
          .maybeSingle();

        if (!serviceError && serviceData) {
          const fallbackRow = serviceData as {
            id: string;
            status: string;
            visibility: string;
            access_rules: unknown;
            creator_id: string;
          };

          const accessRules = normalizeAccessRules(fallbackRow.access_rules);
          // Keep non-institution private markets hidden from anonymous fallback probes.
          if (!hasInstitutionAccessRule(accessRules)) {
            return { kind: "not_found" };
          }

          const access = canViewerAccessMarketDetail(
            {
              status: fallbackRow.status,
              visibility: fallbackRow.visibility,
              creatorId: fallbackRow.creator_id,
              accessRules,
            },
            viewer,
            {
              hasLegacyPosition: false,
            }
          );

          if (access.reason === "login_required") {
            return { kind: "login_required" };
          }

          if (access.reason === "institution_verification_required") {
            return { kind: "institution_verification_required" };
          }
        }
      } catch {
        // Fall through to not_found when service fallback is unavailable.
      }
    }

    return { kind: "not_found" };
  }

  const row = data as MarketDetailRow;
  const accessRules = normalizeAccessRules(row.access_rules);
  let viewerPosition: MarketViewerPositionDTO | null = null;
  let hasLegacyPosition = false;

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
        hasLegacyPosition = positionTotalShares > 0;

        viewerPosition = {
          yesShares: positionYesShares,
          noShares: positionNoShares,
          totalShares: positionTotalShares,
          averageEntryPriceYes: toOptionalNumber(position.average_entry_price_yes),
          averageEntryPriceNo: toOptionalNumber(position.average_entry_price_no),
          realizedPnl: toNumber(position.realized_pnl, 0),
          markValue: 0,
        };
      }
    } catch {
      viewerPosition = null;
      hasLegacyPosition = false;
    }
  }

  const access = canViewerAccessMarketDetail(
    {
      status: row.status,
      visibility: row.visibility,
      creatorId: row.creator_id,
      accessRules,
    },
    viewer,
    {
      hasLegacyPosition,
    }
  );

  if (!access.allowed) {
    if (access.reason === "login_required") {
      return { kind: "login_required" };
    }

    if (access.reason === "institution_verification_required") {
      return { kind: "institution_verification_required" };
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
  let evidenceRows: EvidenceRow[] = [];
  let contributionRows: ResolverPrizeContributionRow[] = [];
  let viewerResolverBond: ViewerResolverBondDTO | null = null;
  let viewerChallenge: ViewerChallengeDTO | null = null;
  let yesBondTotal = 0;
  let noBondTotal = 0;
  let challengeCount = 0;
  let openChallengeCount = 0;
  let resolverStakeCap = 1;

  try {
    const [evidenceResult, contributionResult] = await Promise.all([
      supabase
        .from("market_evidence")
        .select("id, submitted_by, evidence_url, evidence_text, notes, submitted_outcome, created_at")
        .eq("market_id", marketId)
        .order("created_at", { ascending: false })
        .limit(60),
      supabase
        .from("market_resolver_prize_contributions")
        .select("id, contributor_id, amount, status, created_at")
        .eq("market_id", marketId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (!evidenceResult.error && Array.isArray(evidenceResult.data)) {
      evidenceRows = evidenceResult.data as EvidenceRow[];
    }

    if (!contributionResult.error && Array.isArray(contributionResult.data)) {
      contributionRows = contributionResult.data as ResolverPrizeContributionRow[];
    }
  } catch {
    evidenceRows = [];
    contributionRows = [];
  }

  if (viewer.isAuthenticated && viewer.userId) {
    try {
      const [viewerBondResult, viewerChallengeResult] = await Promise.all([
        supabase
          .from("market_resolver_bonds")
          .select("id, outcome, bond_amount, created_at")
          .eq("market_id", marketId)
          .eq("user_id", viewer.userId)
          .maybeSingle(),
        supabase
          .from("market_disputes")
          .select("id, status, challenge_bond_amount, proposed_outcome, reason, created_at, expires_at")
          .eq("market_id", marketId)
          .eq("created_by", viewer.userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (!viewerBondResult.error && viewerBondResult.data) {
        const bond = viewerBondResult.data as {
          id: string;
          outcome: string;
          bond_amount: number | string | null;
          created_at: string;
        };

        viewerResolverBond = {
          id: bond.id,
          outcome: bond.outcome,
          bondAmount: Math.max(0, toNumber(bond.bond_amount, 0)),
          createdAt: bond.created_at,
        };
      }

      if (!viewerChallengeResult.error && viewerChallengeResult.data) {
        const challenge = viewerChallengeResult.data as {
          id: string;
          status: string;
          challenge_bond_amount: number | string | null;
          proposed_outcome: string | null;
          reason: string;
          created_at: string;
          expires_at: string | null;
        };

        viewerChallenge = {
          id: challenge.id,
          status: challenge.status,
          challengeBondAmount: Math.max(0, toNumber(challenge.challenge_bond_amount, 0)),
          proposedOutcome: challenge.proposed_outcome,
          reason: challenge.reason,
          createdAt: challenge.created_at,
          expiresAt: challenge.expires_at,
        };
      }
    } catch {
      viewerResolverBond = null;
      viewerChallenge = null;
    }
  }

  if (isSupabaseServiceEnvConfigured()) {
    try {
      const service = createServiceClient();
      const [allBondsResult, allChallengesResult, capResult] = await Promise.all([
        service
          .from("market_resolver_bonds")
          .select("id, user_id, outcome, bond_amount, created_at")
          .eq("market_id", marketId),
        service
          .from("market_disputes")
          .select("id, created_by, status, challenge_bond_amount, proposed_outcome, reason, created_at, expires_at")
          .eq("market_id", marketId),
        service.rpc("resolve_market_avg_bet_cap", { p_market_id: marketId }),
      ]);

      if (!allBondsResult.error && Array.isArray(allBondsResult.data)) {
        const bonds = allBondsResult.data as ResolverBondRow[];
        yesBondTotal = bonds
          .filter((bond) => bond.outcome === "yes")
          .reduce((sum, bond) => sum + Math.max(0, toNumber(bond.bond_amount, 0)), 0);
        noBondTotal = bonds
          .filter((bond) => bond.outcome === "no")
          .reduce((sum, bond) => sum + Math.max(0, toNumber(bond.bond_amount, 0)), 0);
      }

      if (!allChallengesResult.error && Array.isArray(allChallengesResult.data)) {
        const challenges = allChallengesResult.data as ChallengeRow[];
        challengeCount = challenges.length;
        openChallengeCount = challenges.filter((challenge) =>
          challenge.status === "open" || challenge.status === "under_review"
        ).length;
      }

      if (!capResult.error) {
        resolverStakeCap = Math.max(1, toNumber(capResult.data as number | string | null, 1));
      }
    } catch {
      resolverStakeCap = Math.max(1, resolverStakeCap);
    }
  }

  if (yesBondTotal === 0 && noBondTotal === 0 && viewerResolverBond) {
    if (viewerResolverBond.outcome === "yes") {
      yesBondTotal = viewerResolverBond.bondAmount;
    } else if (viewerResolverBond.outcome === "no") {
      noBondTotal = viewerResolverBond.bondAmount;
    }
  }

  const chartPoints = buildMarketDetailChartPoints({
    createdAt: row.created_at,
    closeTime: row.close_time,
    expectedResolutionTime: row.expected_resolution_time,
    priceYes,
  });

  if (viewerPosition) {
    viewerPosition = {
      ...viewerPosition,
      markValue: viewerPosition.yesShares * priceYes + viewerPosition.noShares * priceNo,
    };
  }

  const viewerCanTrade = viewer.isAuthenticated && !access.readOnlyLegacy;
  const nowMs = Date.now();
  const resolutionWindowEndsMs = row.resolution_window_ends_at ? Date.parse(row.resolution_window_ends_at) : Number.NaN;
  const challengeWindowEndsMs = row.challenge_window_ends_at ? Date.parse(row.challenge_window_ends_at) : Number.NaN;
  const resolutionWindowOpen = !Number.isFinite(resolutionWindowEndsMs) || nowMs < resolutionWindowEndsMs;
  const challengeWindowOpen = Number.isFinite(challengeWindowEndsMs) && nowMs < challengeWindowEndsMs;
  const viewerCanResolve =
    viewer.isAuthenticated &&
    row.resolution_mode === "community" &&
    (row.status === "closed" || row.status === "pending_resolution") &&
    !row.finalized_at &&
    resolutionWindowOpen &&
    !viewerResolverBond;
  const viewerCanChallenge =
    viewer.isAuthenticated &&
    row.resolution_mode === "community" &&
    row.status === "resolved" &&
    !row.finalized_at &&
    row.provisional_outcome !== null &&
    (row.provisional_outcome === "yes" || row.provisional_outcome === "no") &&
    challengeWindowOpen &&
    !!viewerResolverBond &&
    viewerResolverBond.outcome !== row.provisional_outcome &&
    !viewerChallenge;

  const evidence = evidenceRows.map((entry) => ({
    id: entry.id,
    submittedBy: entry.submitted_by,
    evidenceUrl: cleanText(entry.evidence_url) || null,
    evidenceText: cleanText(entry.evidence_text) || null,
    notes: cleanText(entry.notes) || null,
    submittedOutcome: entry.submitted_outcome,
    createdAt: entry.created_at,
  }));

  const resolverPrizeRecentContributions = contributionRows.map((contribution) => ({
    id: contribution.id,
    contributorId: contribution.contributor_id,
    amount: Math.max(0, toNumber(contribution.amount, 0)),
    status: contribution.status,
    createdAt: contribution.created_at,
  }));
  const resolverPrizeLockedTotal = resolverPrizeRecentContributions
    .filter((contribution) => contribution.status === "locked")
    .reduce((sum, contribution) => sum + contribution.amount, 0);
  const resolverPrizeContributionCount = resolverPrizeRecentContributions.length;

  return {
    kind: "ok",
    market: {
      id: row.id,
      question: row.question,
      description: row.description,
      resolvesYesIf: row.resolves_yes_if,
      resolvesNoIf: row.resolves_no_if,
      status: row.status,
      resolutionMode: row.resolution_mode,
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
      resolutionOutcome: row.resolution_outcome,
      provisionalOutcome: row.provisional_outcome,
      resolvedAt: row.resolved_at,
      provisionalResolvedAt: row.provisional_resolved_at,
      finalizedAt: row.finalized_at,
      resolutionWindowEndsAt: row.resolution_window_ends_at,
      challengeWindowEndsAt: row.challenge_window_ends_at,
      adjudicationRequired: row.adjudication_required === true,
      adjudicationReason: row.adjudication_reason,
      voidReason: row.void_reason,
      challengeBonusRate: Math.max(0, Math.min(1, toNumber(row.challenge_bonus_rate, 0.1))),
      challengeBondAmount: Math.max(0, toNumber(row.challenge_bond_amount, 1)),
      listingFeeAmount: Math.max(0, toNumber(row.listing_fee_amount, 0.5)),
      creatorRakePaidAmount: Math.max(0, toNumber(row.creator_rake_paid_amount, 0)),
      creatorRakePaidAt: row.creator_rake_paid_at,
      finalOutcomeChangedByChallenge: row.final_outcome_changed_by_challenge === true,
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
      viewerCanTrade,
      viewerReadOnlyReason: access.readOnlyLegacy ? "legacy_institution_access" : null,
      resolverStakeCap: Math.max(1, resolverStakeCap),
      yesBondTotal: Number(yesBondTotal.toFixed(6)),
      noBondTotal: Number(noBondTotal.toFixed(6)),
      challengeCount,
      openChallengeCount,
      viewerResolverBond,
      viewerChallenge,
      viewerCanResolve,
      viewerCanChallenge,
      evidence,
      resolverPrizeLockedTotal: Number(resolverPrizeLockedTotal.toFixed(6)),
      resolverPrizeContributionCount,
      resolverPrizeRecentContributions,
    },
  };
}
