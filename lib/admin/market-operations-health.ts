import { listRecentResearchRunsForAdmin, type AdminResearchRunCard } from "@/lib/automation/market-research/db";
import { createServiceClient } from "@/lib/supabase/service";
import { getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";

const HEALTH_STATUSES = [
  "draft",
  "review",
  "open",
  "trading_halted",
  "closed",
  "pending_resolution",
  "resolved",
  "finalized",
] as const;

type MarketHealthRow = {
  id: string;
  status: string;
  close_time: string | null;
  finalized_at: string | null;
};

type ActivityMarketRow = {
  market_id: string;
};

type AdminActionRow = {
  action: string;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

type CommunityResolutionSyncRunRow = {
  status: string;
  summary: Record<string, unknown> | null;
  error_message: string | null;
  ran_at: string;
};

export type AdminMarketActionSummary = {
  action: "approved" | "rejected";
  marketId: string | null;
  marketQuestion: string | null;
  createdAt: string;
};

export type CommunityResolutionSyncSummary = {
  status: string;
  ranAt: string;
  summary: Record<string, unknown>;
  errorMessage: string | null;
};

export type MarketOperationsHealth = {
  readHealth: "ok" | "error";
  serviceRoleHealth: "ok" | "error";
  errorMessage: string | null;
  checkedAt: string;
  authConfigPresent: boolean;
  missingAuthConfig: string[];
  deployment: {
    environment: string | null;
    commitSha: string | null;
    commitRef: string | null;
    deploymentUrlPresent: boolean;
  };
  marketCountsByStatus: Record<string, number>;
  reviewCount: number;
  openCount: number;
  finalizedCount: number;
  marketsPendingReview: number;
  marketsNeedingResolution: number;
  closedUnresolvedCount: number;
  noActionRetirementCandidates: number;
  staleClosedMarkets: number;
  automationFreshness: {
    latestStartedAt: string | null;
    latestCompletedAt: string | null;
    latestStatus: string | null;
  };
  latestPublicRun: AdminResearchRunCard | null;
  latestInstitutionRun: AdminResearchRunCard | null;
  latestScoutRun: AdminResearchRunCard | null;
  latestProposalApproved: AdminMarketActionSummary | null;
  latestProposalRejected: AdminMarketActionSummary | null;
  latestFailures: Array<Pick<AdminResearchRunCard, "id" | "scope" | "status" | "startedAt" | "errorMessage">>;
  latestCommunityResolutionSync: CommunityResolutionSyncSummary | null;
};

export function countNoActionRetirementCandidates(input: {
  markets: MarketHealthRow[];
  tradeMarketIds: Iterable<string>;
  resolverBondMarketIds: Iterable<string>;
  nowIso: string;
}): number {
  const nowMs = Date.parse(input.nowIso);
  const tradeIds = new Set(input.tradeMarketIds);
  const resolverBondIds = new Set(input.resolverBondMarketIds);

  return input.markets.filter((market) => {
    const closeMs = market.close_time ? Date.parse(market.close_time) : Number.NaN;
    return (
      market.status === "closed" &&
      !market.finalized_at &&
      Number.isFinite(closeMs) &&
      closeMs <= nowMs &&
      !tradeIds.has(market.id) &&
      !resolverBondIds.has(market.id)
    );
  }).length;
}

function emptyCounts(): Record<string, number> {
  return Object.fromEntries(HEALTH_STATUSES.map((status) => [status, 0]));
}

function latestByScope(runs: AdminResearchRunCard[], scope: string): AdminResearchRunCard | null {
  return runs.find((run) => run.scope === scope) ?? null;
}

function summarizeAction(row: AdminActionRow): AdminMarketActionSummary {
  return {
    action: row.action === "market_reject" ? "rejected" : "approved",
    marketId: row.target_id,
    marketQuestion: typeof row.details?.marketQuestion === "string" ? row.details.marketQuestion : null,
    createdAt: row.created_at,
  };
}

function baseHealth(nowIso: string): Omit<
  MarketOperationsHealth,
  | "readHealth"
  | "serviceRoleHealth"
  | "errorMessage"
  | "marketCountsByStatus"
  | "reviewCount"
  | "openCount"
  | "finalizedCount"
  | "marketsPendingReview"
  | "marketsNeedingResolution"
  | "closedUnresolvedCount"
  | "noActionRetirementCandidates"
  | "staleClosedMarkets"
  | "automationFreshness"
  | "latestPublicRun"
  | "latestInstitutionRun"
  | "latestScoutRun"
  | "latestProposalApproved"
  | "latestProposalRejected"
  | "latestFailures"
  | "latestCommunityResolutionSync"
> {
  return {
    checkedAt: nowIso,
    authConfigPresent: isSupabaseServerEnvConfigured(),
    missingAuthConfig: getMissingSupabaseServerEnv(),
    deployment: {
      environment: process.env.VERCEL_ENV ?? null,
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      commitRef: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      deploymentUrlPresent: Boolean(process.env.VERCEL_URL),
    },
  };
}

export async function loadMarketOperationsHealth(): Promise<MarketOperationsHealth> {
  const service = createServiceClient();
  const nowIso = new Date().toISOString();
  const baseline = baseHealth(nowIso);

  try {
    const [marketsResult, runs, actionResult, syncRunResult] = await Promise.all([
      service
        .from("markets")
        .select("id, status, close_time, finalized_at")
        .in("status", [...HEALTH_STATUSES])
        .limit(5000),
      listRecentResearchRunsForAdmin(20),
      service
        .from("admin_action_log")
        .select("action, target_id, details, created_at")
        .in("action", ["market_approve", "market_reject"])
        .order("created_at", { ascending: false })
        .limit(10),
      service
        .from("community_resolution_sync_runs")
        .select("status, summary, error_message, ran_at")
        .order("ran_at", { ascending: false })
        .limit(1),
    ]);

    if (marketsResult.error) {
      return {
        ...baseline,
        readHealth: "error",
        serviceRoleHealth: "ok",
        errorMessage: marketsResult.error.message,
        marketCountsByStatus: emptyCounts(),
        reviewCount: 0,
        openCount: 0,
        finalizedCount: 0,
        marketsPendingReview: 0,
        marketsNeedingResolution: 0,
        closedUnresolvedCount: 0,
        noActionRetirementCandidates: 0,
        staleClosedMarkets: 0,
        automationFreshness: { latestStartedAt: null, latestCompletedAt: null, latestStatus: null },
        latestPublicRun: null,
        latestInstitutionRun: null,
        latestScoutRun: null,
        latestProposalApproved: null,
        latestProposalRejected: null,
        latestFailures: [],
        latestCommunityResolutionSync: null,
      };
    }

    const markets = (marketsResult.data ?? []) as MarketHealthRow[];
    const closedCandidates = markets.filter((market) => market.status === "closed" && !market.finalized_at);
    const closedCandidateIds = closedCandidates.map((market) => market.id);
    const [tradeResult, resolverBondResult] =
      closedCandidateIds.length > 0
        ? await Promise.all([
            service.from("trade_fills").select("market_id").in("market_id", closedCandidateIds).limit(5000),
            service.from("market_resolver_bonds").select("market_id").in("market_id", closedCandidateIds).limit(5000),
          ])
        : [
            { data: [], error: null },
            { data: [], error: null },
          ];

    if (tradeResult.error || resolverBondResult.error) {
      return {
        ...baseline,
        readHealth: "error",
        serviceRoleHealth: "ok",
        errorMessage: tradeResult.error?.message ?? resolverBondResult.error?.message ?? "Unable to load market activity.",
        marketCountsByStatus: emptyCounts(),
        reviewCount: 0,
        openCount: 0,
        finalizedCount: 0,
        marketsPendingReview: 0,
        marketsNeedingResolution: 0,
        closedUnresolvedCount: 0,
        noActionRetirementCandidates: 0,
        staleClosedMarkets: 0,
        automationFreshness: { latestStartedAt: null, latestCompletedAt: null, latestStatus: null },
        latestPublicRun: latestByScope(runs, "public"),
        latestInstitutionRun: latestByScope(runs, "institution"),
        latestScoutRun: runs[0] ?? null,
        latestProposalApproved: null,
        latestProposalRejected: null,
        latestFailures: runs
          .filter((run) => run.status === "failed" || Boolean(run.errorMessage))
          .slice(0, 4)
          .map((run) => ({
            id: run.id,
            scope: run.scope,
            status: run.status,
            startedAt: run.startedAt,
            errorMessage: run.errorMessage,
          })),
        latestCommunityResolutionSync: null,
      };
    }

    const counts = emptyCounts();
    for (const market of markets) {
      counts[market.status] = (counts[market.status] ?? 0) + 1;
    }

    const latestRun = runs[0] ?? null;
    const actionRows = actionResult.error ? [] : ((actionResult.data ?? []) as AdminActionRow[]);
    const latestProposalApproved = actionRows.find((row) => row.action === "market_approve") ?? null;
    const latestProposalRejected = actionRows.find((row) => row.action === "market_reject") ?? null;
    const syncRows = syncRunResult.error ? [] : ((syncRunResult.data ?? []) as CommunityResolutionSyncRunRow[]);
    const latestSync = syncRows[0] ?? null;
    const noActionRetirementCandidates = countNoActionRetirementCandidates({
      markets: closedCandidates,
      tradeMarketIds: ((tradeResult.data ?? []) as ActivityMarketRow[]).map((row) => row.market_id),
      resolverBondMarketIds: ((resolverBondResult.data ?? []) as ActivityMarketRow[]).map((row) => row.market_id),
      nowIso,
    });

    return {
      ...baseline,
      readHealth: "ok",
      serviceRoleHealth: "ok",
      errorMessage: actionResult.error?.message ?? syncRunResult.error?.message ?? null,
      marketCountsByStatus: counts,
      reviewCount: counts.review ?? 0,
      openCount: counts.open ?? 0,
      finalizedCount: counts.finalized ?? 0,
      marketsPendingReview: counts.review ?? 0,
      marketsNeedingResolution: (counts.closed ?? 0) + (counts.pending_resolution ?? 0) + (counts.resolved ?? 0),
      closedUnresolvedCount: counts.closed ?? 0,
      noActionRetirementCandidates,
      staleClosedMarkets: closedCandidates.length,
      automationFreshness: {
        latestStartedAt: latestRun?.startedAt ?? null,
        latestCompletedAt: latestRun?.completedAt ?? null,
        latestStatus: latestRun?.status ?? null,
      },
      latestPublicRun: latestByScope(runs, "public"),
      latestInstitutionRun: latestByScope(runs, "institution"),
      latestScoutRun: latestRun,
      latestProposalApproved: latestProposalApproved ? summarizeAction(latestProposalApproved) : null,
      latestProposalRejected: latestProposalRejected ? summarizeAction(latestProposalRejected) : null,
      latestFailures: runs
        .filter((run) => run.status === "failed" || Boolean(run.errorMessage))
        .slice(0, 4)
        .map((run) => ({
          id: run.id,
          scope: run.scope,
          status: run.status,
          startedAt: run.startedAt,
          errorMessage: run.errorMessage,
        })),
      latestCommunityResolutionSync: latestSync
        ? {
            status: latestSync.status,
            ranAt: latestSync.ran_at,
            summary: latestSync.summary ?? {},
            errorMessage: latestSync.error_message,
          }
        : null,
    };
  } catch (error) {
    return {
      ...baseline,
      readHealth: "error",
      serviceRoleHealth: "error",
      errorMessage: error instanceof Error ? error.message : "Unable to load market operations health.",
      marketCountsByStatus: emptyCounts(),
      reviewCount: 0,
      openCount: 0,
      finalizedCount: 0,
      marketsPendingReview: 0,
      marketsNeedingResolution: 0,
      closedUnresolvedCount: 0,
      noActionRetirementCandidates: 0,
      staleClosedMarkets: 0,
      automationFreshness: { latestStartedAt: null, latestCompletedAt: null, latestStatus: null },
      latestPublicRun: null,
      latestInstitutionRun: null,
      latestScoutRun: null,
      latestProposalApproved: null,
      latestProposalRejected: null,
      latestFailures: [],
      latestCommunityResolutionSync: null,
    };
  }
}
