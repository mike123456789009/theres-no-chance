import type { MarketDetailDTO, MarketViewerContext } from "@/lib/markets/read-markets";

const EVIDENCE_VISIBLE_STATUSES = new Set(["closed", "pending_resolution", "resolved", "finalized"]);

export function formatDetailDate(value: string | null): string {
  if (!value) return "Not specified";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatPercent(value: number, maximumFractionDigits = 1): string {
  return `${(value * 100).toFixed(maximumFractionDigits)}%`;
}

export function formatDetailStatus(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatShares(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatSignedCurrency(value: number): string {
  if (value === 0) return formatCurrency(0);
  const absolute = formatCurrency(Math.abs(value));
  return value > 0 ? `+${absolute}` : `-${absolute}`;
}

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
