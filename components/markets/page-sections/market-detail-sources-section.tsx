import type { MarketDetailDTO } from "@/lib/markets/read-markets";

type MarketDetailSourcesSectionProps = {
  market: MarketDetailDTO;
};

export function MarketDetailSourcesSection(props: Readonly<MarketDetailSourcesSectionProps>) {
  const { market } = props;

  return (
    <section className="market-detail-section" aria-label="Market sources">
      <h2>Official and supporting sources</h2>
      {market.sources.length === 0 ? (
        <p>No sources were attached to this market.</p>
      ) : (
        <ul className="market-detail-source-list">
          {market.sources.map((source, index) => (
            <li key={`${source.url}-${index}`}>
              <span>{source.type.toUpperCase()}</span>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
