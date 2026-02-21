import Link from "next/link";

import { CommunityResolvePanel } from "@/components/markets/community-resolve-panel";
import { EvidenceSubmissionCard } from "@/components/markets/evidence-submission-card";
import { MarketLiveOverview } from "@/components/markets/market-live-overview";
import { ResolverPrizeBoostCard } from "@/components/markets/resolver-prize-boost-card";
import { TradeInterface } from "@/components/markets/trade-interface";
import type { MarketDetailDTO, MarketViewerContext } from "@/lib/markets/read-markets";
import { deriveDetailCapabilities, formatDetailDate, formatDetailStatus } from "@/lib/markets/view-models/detail";

import { MarketDetailContextSection } from "./market-detail-context-section";
import { MarketDetailPositionPanel } from "./market-detail-position-panel";
import { MarketDetailResolutionSection } from "./market-detail-resolution-section";
import { MarketDetailSourcesSection } from "./market-detail-sources-section";

type MarketDetailMainSectionProps = {
  marketId: string;
  market: MarketDetailDTO;
  viewer: MarketViewerContext;
};

export function MarketDetailMainSection(props: Readonly<MarketDetailMainSectionProps>) {
  const { marketId, market, viewer } = props;
  const { canContributePrize, canSubmitEvidence, showEvidenceCard } = deriveDetailCapabilities({
    market,
    viewer,
  });

  return (
    <section className="market-detail-shell" aria-label="Market detail">
      <div className="market-detail-top-links">
        <Link href="/markets">← Back to markets</Link>
        <a href="/">Landing</a>
        {viewer.isAuthenticated ? <Link href="/create">Create market</Link> : <Link href="/signup">Create account</Link>}
      </div>

      <p className="market-detail-kicker">{market.accessBadge} market</p>
      <h1 className="market-detail-title">{market.question}</h1>
      <div className="market-detail-header-row">
        <p className="market-detail-copy">
          Status: <strong>{formatDetailStatus(market.status)}</strong>
        </p>
        <p className="market-detail-copy market-detail-copy-muted">
          Closes {formatDetailDate(market.closeTime)} • Fee {(market.feeBps / 100).toFixed(2)}% • Resolution{" "}
          {formatDetailStatus(market.resolutionMode)}
        </p>
      </div>

      <section className="market-detail-top-layout" aria-label="Market stats and action panel">
        <MarketLiveOverview
          marketId={marketId}
          initialMarket={{
            chartPoints: market.chartPoints,
            priceYes: market.priceYes,
            priceNo: market.priceNo,
            poolShares: market.poolShares,
            yesShares: market.yesShares,
            noShares: market.noShares,
            liquidityParameter: market.liquidityParameter,
          }}
        />

        <aside className="market-detail-right-rail" aria-label="Action and position rail">
          <TradeInterface
            marketId={marketId}
            marketStatus={market.status}
            currentPriceYes={market.priceYes}
            currentPriceNo={market.priceNo}
            viewerUserId={viewer.userId ?? undefined}
            isAuthenticated={viewer.isAuthenticated}
            canTrade={market.viewerCanTrade}
            tradeDisabledReason={
              market.viewerReadOnlyReason === "legacy_institution_access"
                ? "Read-only access: existing position retained after institution switch."
                : undefined
            }
          />

          <MarketDetailPositionPanel market={market} />

          <ResolverPrizeBoostCard
            marketId={marketId}
            viewerIsAuthenticated={viewer.isAuthenticated}
            canContribute={canContributePrize}
            resolverPrizeLockedTotal={market.resolverPrizeLockedTotal}
            resolverPrizeContributionCount={market.resolverPrizeContributionCount}
            recentContributions={market.resolverPrizeRecentContributions}
          />
        </aside>
      </section>

      <div className="market-detail-bottom-grid">
        <CommunityResolvePanel
          marketId={marketId}
          status={market.status}
          resolutionWindowEndsAt={market.resolutionWindowEndsAt}
          challengeWindowEndsAt={market.challengeWindowEndsAt}
          provisionalOutcome={market.provisionalOutcome}
          resolutionOutcome={market.resolutionOutcome}
          adjudicationRequired={market.adjudicationRequired}
          adjudicationReason={market.adjudicationReason}
          yesBondTotal={market.yesBondTotal}
          noBondTotal={market.noBondTotal}
          resolverStakeCap={market.resolverStakeCap}
          challengeCount={market.challengeCount}
          openChallengeCount={market.openChallengeCount}
          viewerIsAuthenticated={viewer.isAuthenticated}
          viewerCanResolve={market.viewerCanResolve}
          viewerCanChallenge={market.viewerCanChallenge}
          viewerResolverBond={market.viewerResolverBond}
          viewerChallenge={market.viewerChallenge}
        />

        {showEvidenceCard ? (
          <EvidenceSubmissionCard
            marketId={marketId}
            marketStatus={market.status}
            canSubmitEvidence={canSubmitEvidence}
            viewerIsAuthenticated={viewer.isAuthenticated}
            evidenceRules={market.evidenceRules}
            evidence={market.evidence}
          />
        ) : null}

        <MarketDetailContextSection market={market} />
        <MarketDetailResolutionSection market={market} />
        <MarketDetailSourcesSection market={market} />
      </div>
    </section>
  );
}
