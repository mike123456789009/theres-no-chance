import { listRecentResearchRunsForAdmin, type AdminResearchRunCard } from "@/lib/automation/market-research/db";
import { createServiceClient } from "@/lib/supabase/service";

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

export type MarketOperationsHealth = {
  readHealth: "ok" | "error";
  serviceRoleHealth: "ok" | "error";
  errorMessage: string | null;
  marketCountsByStatus: Record<string, number>;
  reviewCount: number;
  openCount: number;
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
  latestFailures: Array<Pick<AdminResearchRunCard, "id" | "scope" | "status" | "startedAt" | "errorMessage">>;
  latestCronSummary: string | null;
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

export async function loadMarketOperationsHealth(): Promise<MarketOperationsHealth> {
  const service = createServiceClient();
  const nowIso = new Date().toISOString();

  try {
    const [marketsResult, runs] = await Promise.all([
      service
        .from("markets")
        .select("id, status, close_time, finalized_at")
        .in("status", [...HEALTH_STATUSES])
        .limit(5000),
      listRecentResearchRunsForAdmin(20),
    ]);

    if (marketsResult.error) {
      return {
        readHealth: "error",
        serviceRoleHealth: "ok",
        errorMessage: marketsResult.error.message,
        marketCountsByStatus: emptyCounts(),
        reviewCount: 0,
        openCount: 0,
        closedUnresolvedCount: 0,
        noActionRetirementCandidates: 0,
        staleClosedMarkets: 0,
        automationFreshness: { latestStartedAt: null, latestCompletedAt: null, latestStatus: null },
        latestPublicRun: null,
        latestInstitutionRun: null,
        latestFailures: [],
        latestCronSummary: null,
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
        readHealth: "error",
        serviceRoleHealth: "ok",
        errorMessage: tradeResult.error?.message ?? resolverBondResult.error?.message ?? "Unable to load market activity.",
        marketCountsByStatus: emptyCounts(),
        reviewCount: 0,
        openCount: 0,
        closedUnresolvedCount: 0,
        noActionRetirementCandidates: 0,
        staleClosedMarkets: 0,
        automationFreshness: { latestStartedAt: null, latestCompletedAt: null, latestStatus: null },
        latestPublicRun: latestByScope(runs, "public"),
        latestInstitutionRun: latestByScope(runs, "institution"),
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
        latestCronSummary: null,
      };
    }

    const counts = emptyCounts();
    for (const market of markets) {
      counts[market.status] = (counts[market.status] ?? 0) + 1;
    }

    const latestRun = runs[0] ?? null;
    const noActionRetirementCandidates = countNoActionRetirementCandidates({
      markets: closedCandidates,
      tradeMarketIds: ((tradeResult.data ?? []) as ActivityMarketRow[]).map((row) => row.market_id),
      resolverBondMarketIds: ((resolverBondResult.data ?? []) as ActivityMarketRow[]).map((row) => row.market_id),
      nowIso,
    });

    return {
      readHealth: "ok",
      serviceRoleHealth: "ok",
      errorMessage: null,
      marketCountsByStatus: counts,
      reviewCount: counts.review ?? 0,
      openCount: counts.open ?? 0,
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
      latestCronSummary: null,
    };
  } catch (error) {
    return {
      readHealth: "error",
      serviceRoleHealth: "error",
      errorMessage: error instanceof Error ? error.message : "Unable to load market operations health.",
      marketCountsByStatus: emptyCounts(),
      reviewCount: 0,
      openCount: 0,
      closedUnresolvedCount: 0,
      noActionRetirementCandidates: 0,
      staleClosedMarkets: 0,
      automationFreshness: { latestStartedAt: null, latestCompletedAt: null, latestStatus: null },
      latestPublicRun: null,
      latestInstitutionRun: null,
      latestFailures: [],
      latestCronSummary: null,
    };
  }
}
