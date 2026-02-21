import Link from "next/link";

import type { MarketDetailDTO } from "@/lib/markets/read-markets";
import { formatCurrency, formatPercent, formatShares, formatSignedCurrency } from "@/lib/markets/view-models/detail";

type MarketDetailPositionPanelProps = {
  market: MarketDetailDTO;
};

export function MarketDetailPositionPanel(props: Readonly<MarketDetailPositionPanelProps>) {
  const { market } = props;

  return (
    <article className="market-detail-position-panel">
      <h2>Your position</h2>
      {market.actionRequired === "create_account" ? (
        <>
          <p>Log in to view personal exposure, P&amp;L, and mark value.</p>
          <div className="market-detail-action-links">
            <Link href="/login">Log in</Link>
            <Link href="/signup">Create account</Link>
          </div>
        </>
      ) : market.viewerPosition ? (
        <div className="market-detail-position-grid">
          <p>
            <span>YES shares</span>
            <strong>{formatShares(market.viewerPosition.yesShares)}</strong>
          </p>
          <p>
            <span>NO shares</span>
            <strong>{formatShares(market.viewerPosition.noShares)}</strong>
          </p>
          <p>
            <span>Total shares</span>
            <strong>{formatShares(market.viewerPosition.totalShares)}</strong>
          </p>
          <p>
            <span>Mark value</span>
            <strong>{formatCurrency(market.viewerPosition.markValue)}</strong>
          </p>
          <p>
            <span>Avg YES entry</span>
            <strong>
              {market.viewerPosition.averageEntryPriceYes === null
                ? "N/A"
                : formatPercent(market.viewerPosition.averageEntryPriceYes, 2)}
            </strong>
          </p>
          <p>
            <span>Avg NO entry</span>
            <strong>
              {market.viewerPosition.averageEntryPriceNo === null
                ? "N/A"
                : formatPercent(market.viewerPosition.averageEntryPriceNo, 2)}
            </strong>
          </p>
          <p className="market-detail-position-full">
            <span>Realized P&amp;L</span>
            <strong
              className={
                market.viewerPosition.realizedPnl > 0
                  ? "market-detail-positive"
                  : market.viewerPosition.realizedPnl < 0
                    ? "market-detail-negative"
                    : undefined
              }
            >
              {formatSignedCurrency(market.viewerPosition.realizedPnl)}
            </strong>
          </p>
        </div>
      ) : (
        <p>No position in this market yet. Your first fill will appear here.</p>
      )}

    </article>
  );
}
