import type { MarketDetailDTO, MarketViewerContext } from "@/lib/markets/read-markets";
import { formatMarketLifecycleLabel } from "@/lib/markets/lifecycle";
import {
  formatCurrency,
  formatDateTime,
  formatLabel,
  formatPercent as formatPercentValue,
  formatSignedCurrency,
} from "@/lib/shared/formatters";

const EVIDENCE_VISIBLE_STATUSES = new Set(["closed", "pending_resolution", "resolved", "finalized"]);

export function formatDetailDate(value: string | null): string {
  return formatDateTime(value, { missingFallback: "Not specified" });
}

export function formatPercent(value: number, maximumFractionDigits = 1): string {
  return formatPercentValue(value, maximumFractionDigits);
}

export function formatDetailStatus(value: string): string {
  return formatLabel(value);
}

export function formatDetailLifecycleLabel(
  market: Pick<MarketDetailDTO, "status" | "resolutionOutcome" | "finalizedAt" | "voidReason">
): string {
  return formatMarketLifecycleLabel(market);
}

export function formatShares(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

export { formatCurrency, formatSignedCurrency };

export function deriveDetailCapabilities(options: {
  market: MarketDetailDTO;
  viewer: MarketViewerContext;
}): {
  showEvidenceCard: boolean;
  canSubmitEvidence: boolean;
  canContributePrize: boolean;
} {
  const { market, viewer } = options;
  const showEvidenceCard = EVIDENCE_VISIBLE_STATUSES.has(market.status);
  const canSubmitEvidence =
    viewer.isAuthenticated && showEvidenceCard && market.status !== "finalized" && !market.finalizedAt;
  const canContributePrize = viewer.isAuthenticated && !market.finalizedAt;

  return {
    showEvidenceCard,
    canSubmitEvidence,
    canContributePrize,
  };
}
