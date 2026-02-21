import { createServiceClient } from "@/lib/supabase/service";

import { toNumber } from "./helpers";

export type ResolutionEvidenceContext = {
  id: string;
  submittedBy: string;
  submittedOutcome: string | null;
  evidenceUrl: string | null;
  evidenceText: string | null;
  notes: string | null;
  createdAt: string;
};

export type ResolutionChallengeContext = {
  id: string;
  createdBy: string;
  status: string;
  proposedOutcome: string | null;
  challengeBondAmount: number;
  reason: string;
  createdAt: string;
  expiresAt: string;
  resolverBondOutcome: string | null;
  resolverBondAmount: number | null;
  resolverBondUserId: string | null;
};

export type ResolutionMarket = {
  id: string;
  question: string;
  status: string;
  resolutionMode: string;
  closeTime: string;
  resolvedAt: string | null;
  finalizedAt: string | null;
  resolutionOutcome: string | null;
  provisionalOutcome: string | null;
  resolutionWindowEndsAt: string | null;
  challengeWindowEndsAt: string | null;
  adjudicationRequired: boolean;
  adjudicationReason: string | null;
  yesBondTotal: number;
  noBondTotal: number;
  challengeCount: number;
  openChallengeCount: number;
  creatorId: string;
  tags: string[];
  totalEvidenceCount: number;
  recentEvidence: ResolutionEvidenceContext[];
  challengeContext: ResolutionChallengeContext[];
};

export type ResolutionChallenge = {
  id: string;
  createdBy: string;
  status: string;
  proposedOutcome: string | null;
  challengeBondAmount: number;
  reason: string;
  createdAt: string;
  expiresAt: string;
  adjudicatedAt: string | null;
  isSuccessful: boolean;
  payoutBonusAmount: number;
};

export type ResolutionPoolPreview = {
  P: number;
  R: number;
  B: number;
  RPrime: number;
  SC: number;
  SW: number;
  CW: number;
};

type ResolutionMarketRow = {
  id: string;
  question: string;
  status: string;
  resolution_mode: string;
  close_time: string;
  resolved_at: string | null;
  finalized_at: string | null;
  resolution_outcome: string | null;
  provisional_outcome: string | null;
  resolution_window_ends_at: string | null;
  challenge_window_ends_at: string | null;
  adjudication_required: boolean | null;
  adjudication_reason: string | null;
  creator_id: string;
  tags: string[] | null;
};

type ResolverBondRow = {
  id: string;
  market_id: string;
  user_id: string;
  outcome: string;
  bond_amount: number | string | null;
};

type ChallengeRow = {
  id: string;
  market_id: string;
  created_by: string;
  status: string;
  proposed_outcome: string | null;
  challenge_bond_amount: number | string | null;
  reason: string;
  created_at: string;
  expires_at: string;
  adjudicated_at: string | null;
  is_successful: boolean | null;
  payout_bonus_amount: number | string | null;
  resolver_bond_id: string | null;
};

type EvidenceRow = {
  id: string;
  market_id: string;
  submitted_by: string;
  submitted_outcome: string | null;
  evidence_url: string | null;
  evidence_text: string | null;
  notes: string | null;
  created_at: string;
};

export const DEFAULT_DISPUTE_WINDOW_HOURS = 24;
export const DEFAULT_RESOLUTION_WINDOW_HOURS = 24;

export function getDisputeWindowHours(): number {
  return DEFAULT_DISPUTE_WINDOW_HOURS;
}

export function getResolutionWindowHours(): number {
  const parsed = Number(process.env.MARKET_RESOLUTION_WINDOW_HOURS);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.max(1, Math.floor(parsed));
  }
  return DEFAULT_RESOLUTION_WINDOW_HOURS;
}

export async function loadResolutionMarkets(): Promise<{
  autoFinalizable: ResolutionMarket[];
  adjudicationRequired: ResolutionMarket[];
  finalizedMarkets: ResolutionMarket[];
  errorMessage: string;
}> {
  const service = createServiceClient();
  const nowIso = new Date().toISOString();
  const resolutionWindowHours = getResolutionWindowHours();

  await service.rpc("sync_market_close_state", { p_market_id: null });
  await service.rpc("sync_due_community_resolutions", {
    p_resolution_window_hours: resolutionWindowHours,
  });

  const { data: resolutionData, error: resolutionError } = await service
    .from("markets")
    .select(
      "id, question, status, resolution_mode, close_time, resolved_at, finalized_at, resolution_outcome, provisional_outcome, resolution_window_ends_at, challenge_window_ends_at, adjudication_required, adjudication_reason, creator_id, tags"
    )
    .eq("resolution_mode", "community")
    .in("status", ["resolved", "finalized"])
    .order("resolved_at", { ascending: false })
    .limit(180);

  if (resolutionError) {
    return {
      autoFinalizable: [],
      adjudicationRequired: [],
      finalizedMarkets: [],
      errorMessage: resolutionError.message,
    };
  }

  const rows = (resolutionData ?? []) as ResolutionMarketRow[];
  const marketIds = Array.from(new Set(rows.map((row) => row.id)));

  const [bondResult, challengeResult, evidenceResult] = await Promise.all([
    marketIds.length
      ? service
          .from("market_resolver_bonds")
          .select("id, market_id, user_id, outcome, bond_amount")
          .in("market_id", marketIds)
      : Promise.resolve({ data: [] as ResolverBondRow[], error: null }),
    marketIds.length
      ? service
          .from("market_disputes")
          .select(
            "id, market_id, created_by, status, proposed_outcome, challenge_bond_amount, reason, created_at, expires_at, adjudicated_at, is_successful, payout_bonus_amount, resolver_bond_id"
          )
          .in("market_id", marketIds)
      : Promise.resolve({ data: [] as ChallengeRow[], error: null }),
    marketIds.length
      ? service
          .from("market_evidence")
          .select("id, market_id, submitted_by, submitted_outcome, evidence_url, evidence_text, notes, created_at")
          .in("market_id", marketIds)
      : Promise.resolve({ data: [] as EvidenceRow[], error: null }),
  ]);

  if (bondResult.error) {
    return {
      autoFinalizable: [],
      adjudicationRequired: [],
      finalizedMarkets: [],
      errorMessage: bondResult.error.message,
    };
  }

  if (challengeResult.error) {
    return {
      autoFinalizable: [],
      adjudicationRequired: [],
      finalizedMarkets: [],
      errorMessage: challengeResult.error.message,
    };
  }

  if (evidenceResult.error) {
    return {
      autoFinalizable: [],
      adjudicationRequired: [],
      finalizedMarkets: [],
      errorMessage: evidenceResult.error.message,
    };
  }

  const bondsByMarket = new Map<string, ResolverBondRow[]>();
  const bondsById = new Map<string, ResolverBondRow>();
  const challengesByMarket = new Map<string, ChallengeRow[]>();
  const evidenceByMarket = new Map<string, EvidenceRow[]>();

  ((bondResult.data ?? []) as ResolverBondRow[]).forEach((row) => {
    const existing = bondsByMarket.get(row.market_id) ?? [];
    existing.push(row);
    bondsByMarket.set(row.market_id, existing);
    bondsById.set(row.id, row);
  });

  ((challengeResult.data ?? []) as ChallengeRow[]).forEach((row) => {
    const existing = challengesByMarket.get(row.market_id) ?? [];
    existing.push(row);
    challengesByMarket.set(row.market_id, existing);
  });

  ((evidenceResult.data ?? []) as EvidenceRow[]).forEach((row) => {
    const existing = evidenceByMarket.get(row.market_id) ?? [];
    existing.push(row);
    evidenceByMarket.set(row.market_id, existing);
  });

  const mapRow = (row: ResolutionMarketRow): ResolutionMarket => {
    const marketBonds = bondsByMarket.get(row.id) ?? [];
    const marketChallenges = challengesByMarket.get(row.id) ?? [];
    const marketEvidence = evidenceByMarket.get(row.id) ?? [];
    const yesBondTotal = marketBonds
      .filter((bond) => bond.outcome === "yes")
      .reduce((total, bond) => total + Math.max(0, toNumber(bond.bond_amount, 0)), 0);
    const noBondTotal = marketBonds
      .filter((bond) => bond.outcome === "no")
      .reduce((total, bond) => total + Math.max(0, toNumber(bond.bond_amount, 0)), 0);
    const challengeContext = [...marketChallenges]
      .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
      .slice(0, 6)
      .map((challenge): ResolutionChallengeContext => {
        const resolverBond = challenge.resolver_bond_id ? bondsById.get(challenge.resolver_bond_id) ?? null : null;
        return {
          id: challenge.id,
          createdBy: challenge.created_by,
          status: challenge.status,
          proposedOutcome: challenge.proposed_outcome,
          challengeBondAmount: Math.max(0, toNumber(challenge.challenge_bond_amount, 0)),
          reason: challenge.reason,
          createdAt: challenge.created_at,
          expiresAt: challenge.expires_at,
          resolverBondOutcome: resolverBond?.outcome ?? null,
          resolverBondAmount: resolverBond ? Math.max(0, toNumber(resolverBond.bond_amount, 0)) : null,
          resolverBondUserId: resolverBond?.user_id ?? null,
        };
      });
    const recentEvidence = [...marketEvidence]
      .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
      .slice(0, 6)
      .map(
        (entry): ResolutionEvidenceContext => ({
          id: entry.id,
          submittedBy: entry.submitted_by,
          submittedOutcome: entry.submitted_outcome,
          evidenceUrl: entry.evidence_url,
          evidenceText: entry.evidence_text,
          notes: entry.notes,
          createdAt: entry.created_at,
        })
      );

    return {
      id: row.id,
      question: row.question,
      status: row.status,
      resolutionMode: row.resolution_mode,
      closeTime: row.close_time,
      resolvedAt: row.resolved_at,
      finalizedAt: row.finalized_at,
      resolutionOutcome: row.resolution_outcome,
      provisionalOutcome: row.provisional_outcome,
      resolutionWindowEndsAt: row.resolution_window_ends_at,
      challengeWindowEndsAt: row.challenge_window_ends_at,
      adjudicationRequired: row.adjudication_required === true,
      adjudicationReason: row.adjudication_reason,
      yesBondTotal: Number(yesBondTotal.toFixed(6)),
      noBondTotal: Number(noBondTotal.toFixed(6)),
      challengeCount: marketChallenges.length,
      openChallengeCount: marketChallenges.filter((challenge) =>
        challenge.status === "open" || challenge.status === "under_review"
      ).length,
      creatorId: row.creator_id,
      tags: row.tags ?? [],
      totalEvidenceCount: marketEvidence.length,
      recentEvidence,
      challengeContext,
    };
  };

  const mappedRows = rows.map(mapRow);
  const autoFinalizable = mappedRows.filter(
    (row) =>
      row.status === "resolved" &&
      !row.finalizedAt &&
      !row.adjudicationRequired &&
      (!!row.challengeWindowEndsAt ? row.challengeWindowEndsAt <= nowIso : true)
  );
  const adjudicationRequired = mappedRows.filter(
    (row) => row.status === "resolved" && !row.finalizedAt && row.adjudicationRequired
  );
  const finalizedMarkets = mappedRows.filter((row) => row.status === "finalized" || !!row.finalizedAt);

  return {
    autoFinalizable,
    adjudicationRequired,
    finalizedMarkets,
    errorMessage: "",
  };
}
