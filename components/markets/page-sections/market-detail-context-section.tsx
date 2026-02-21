import type { MarketDetailDTO } from "@/lib/markets/read-markets";
import { formatCurrency, formatDetailDate } from "@/lib/markets/view-models/detail";

type MarketDetailContextSectionProps = {
  market: MarketDetailDTO;
};

export function MarketDetailContextSection(props: Readonly<MarketDetailContextSectionProps>) {
  const { market } = props;

  return (
    <section className="market-detail-section market-detail-section-context" aria-label="Market context">
      <h2>Market context</h2>
      <p>{market.description}</p>
      <div className="market-detail-meta-grid">
        <p>
          Created: <strong>{formatDetailDate(market.createdAt)}</strong>
        </p>
        <p>
          Closes: <strong>{formatDetailDate(market.closeTime)}</strong>
        </p>
        <p>
          Expected resolution: <strong>{formatDetailDate(market.expectedResolutionTime)}</strong>
        </p>
        <p>
          Fee: <strong>{(market.feeBps / 100).toFixed(2)}%</strong>
        </p>
        <p>
          Resolver stake cap: <strong>{formatCurrency(market.resolverStakeCap)}</strong>
        </p>
        <p>
          Maker rake paid: <strong>{formatCurrency(market.creatorRakePaidAmount)}</strong>
        </p>
      </div>
      {market.tags.length > 0 ? <p>Tags: {market.tags.join(", ")}</p> : null}
      {market.riskFlags.length > 0 ? <p>Risk flags: {market.riskFlags.join(", ")}</p> : null}
    </section>
  );
}
