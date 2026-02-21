import { createClient } from "@/lib/supabase/server";
import type { MarketCardShadowTone } from "@/lib/markets/presentation";
import type { MarketCategoryKey } from "@/lib/markets/taxonomy";
import { DISCOVERABLE_MARKET_STATUSES } from "@/lib/markets/view-access";

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

export type MarketAmmStateRow = {
  last_price_yes: number | string | null;
  last_price_no: number | string | null;
  yes_shares: number | string | null;
  no_shares: number | string | null;
  liquidity_parameter?: number | string | null;
};

export type MarketSourceRow = {
  source_label: string;
  source_url: string;
  source_type: string;
};

export type MarketDiscoveryRow = {
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

export type MarketDetailRow = {
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

export type ResolverBondRow = {
  id: string;
  user_id: string;
  outcome: string;
  bond_amount: number | string | null;
  created_at: string;
};

export type ChallengeRow = {
  id: string;
  created_by: string;
  status: string;
  challenge_bond_amount: number | string | null;
  proposed_outcome: string | null;
  reason: string;
  created_at: string;
  expires_at: string | null;
};

export type EvidenceRow = {
  id: string;
  submitted_by: string;
  evidence_url: string | null;
  evidence_text: string | null;
  notes: string | null;
  submitted_outcome: string | null;
  created_at: string;
};

export type ResolverPrizeContributionRow = {
  id: string;
  contributor_id: string;
  amount: number | string | null;
  status: string;
  created_at: string;
};

export type PositionRow = {
  yes_shares: number | string | null;
  no_shares: number | string | null;
  average_entry_price_yes: number | string | null;
  average_entry_price_no: number | string | null;
  realized_pnl: number | string | null;
};

export type ActiveMembershipRow = {
  organization_id: string;
} | null;

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export const MARKET_DISCOVERY_LIMIT = 120;
export const MARKET_DETAIL_CHART_POINTS = 9;
export const NEW_MARKET_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const CATEGORY_MATCH_TERMS: Record<Exclude<MarketCategoryKey, "trending" | "new">, string[]> = {
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
