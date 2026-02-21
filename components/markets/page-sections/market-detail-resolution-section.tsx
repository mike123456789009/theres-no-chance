import Link from "next/link";

import type { MarketDetailDTO } from "@/lib/markets/read-markets";
import { formatDetailStatus } from "@/lib/markets/view-models/detail";

type MarketDetailResolutionSectionProps = {
  market: MarketDetailDTO;
};

export function MarketDetailResolutionSection(props: Readonly<MarketDetailResolutionSectionProps>) {
  const { market } = props;

  return (
    <section className="market-detail-section" aria-label="Resolution details">
      <h2>Resolution details</h2>
      <p>
        <strong>Resolves YES if:</strong> {market.resolvesYesIf}
      </p>
      <p>
        <strong>Resolves NO if:</strong> {market.resolvesNoIf}
      </p>
      <p>
        <strong>Resolver authority:</strong>{" "}
        {market.resolutionMode === "community"
          ? "Community provisional outcome + human adjudication only if tie/challenge"
          : "Platform admin final (v1)"}
      </p>
      {market.resolutionMode === "community" ? (
        <p>
          <strong>Vote/challenge windows:</strong> 24h vote + 24h challenge.{" "}
          <Link href="/community-resolve">See full community resolve flow</Link>.
        </p>
      ) : null}
      {market.adjudicationRequired ? (
        <p>
          <strong>Adjudication:</strong> Pending human decision ({formatDetailStatus(market.adjudicationReason ?? "required")}
          ).
        </p>
      ) : null}
      {market.evidenceRules ? (
        <p>
          <strong>Evidence rules:</strong> {market.evidenceRules}
        </p>
      ) : null}
      {market.disputeRules ? (
        <p>
          <strong>Dispute rules:</strong> {market.disputeRules}
        </p>
      ) : null}
    </section>
  );
}
