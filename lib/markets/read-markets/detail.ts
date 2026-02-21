import type { MarketAccessRules } from "@/lib/markets/access-rules";
import { MARKET_CARD_SHADOW_TONES, type MarketCardShadowTone } from "@/lib/markets/presentation";
import { createServiceClient, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";
import {
  canViewerAccessMarketDetail,
  hasInstitutionAccessRule,
  marketAccessBadge,
  normalizeAccessRules,
  requiresAuthenticatedViewer,
} from "@/lib/markets/view-access";

import {
  MARKET_DETAIL_CHART_POINTS,
  type ChallengeRow,
  type EvidenceRow,
  type MarketAmmStateRow,
  type MarketDetailChartPointDTO,
  type MarketDetailDTO,
  type MarketDetailFetchResult,
  type MarketDetailRow,
  type MarketEvidenceDTO,
  type MarketResolverPrizeContributionDTO,
  type MarketSourceRow,
  type MarketViewerContext,
  type MarketViewerPositionDTO,
  type PositionRow,
  type ResolverBondRow,
  type ResolverPrizeContributionRow,
  type SupabaseServerClient,
  type ViewerChallengeDTO,
  type ViewerResolverBondDTO,
} from "./types";

function isSchemaMissingError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("could not find the table 'public.markets'") ||
    normalized.includes('relation "markets" does not exist') ||
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

export function buildMarketDetailChartPoints(options: {
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

export function mapEvidenceRows(evidenceRows: EvidenceRow[]): MarketEvidenceDTO[] {
  return evidenceRows.map((entry) => ({
    id: entry.id,
    submittedBy: entry.submitted_by,
    evidenceUrl: cleanText(entry.evidence_url) || null,
    evidenceText: cleanText(entry.evidence_text) || null,
    notes: cleanText(entry.notes) || null,
    submittedOutcome: entry.submitted_outcome,
    createdAt: entry.created_at,
  }));
}

export function mapResolverPrizeContributionRows(
  contributionRows: ResolverPrizeContributionRow[]
): MarketResolverPrizeContributionDTO[] {
  return contributionRows.map((contribution) => ({
    id: contribution.id,
    contributorId: contribution.contributor_id,
    amount: Math.max(0, toNumber(contribution.amount, 0)),
    status: contribution.status,
    createdAt: contribution.created_at,
  }));
}

function mapMarketSources(sourceRows: MarketSourceRow[] | null): MarketDetailDTO["sources"] {
  const rows = Array.isArray(sourceRows) ? sourceRows : [];
  return rows.map((source) => ({
    label: source.source_label,
    url: source.source_url,
    type: source.source_type,
  }));
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

  const evidence = mapEvidenceRows(evidenceRows);
  const resolverPrizeRecentContributions = mapResolverPrizeContributionRows(contributionRows);
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
      sources: mapMarketSources(row.market_sources),
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
