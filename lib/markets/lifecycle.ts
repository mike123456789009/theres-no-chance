export type MarketLifecycleInput = {
  status: string;
  resolutionOutcome?: string | null;
  finalizedAt?: string | null;
  voidReason?: string | null;
};

function normalize(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function titleCaseStatus(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function isNoActionRetiredMarket(market: MarketLifecycleInput): boolean {
  return normalize(market.status) === "finalized" && normalize(market.voidReason) === "no_activity_at_close";
}

export function formatMarketLifecycleLabel(market: MarketLifecycleInput): string {
  const status = normalize(market.status);
  const outcome = normalize(market.resolutionOutcome);

  if (isNoActionRetiredMarket(market)) {
    return "Retired: no action";
  }

  if (status === "finalized") {
    if (outcome === "yes") return "Finalized: YES";
    if (outcome === "no") return "Finalized: NO";
    if (outcome === "void") return "Finalized: VOID";
    return "Finalized";
  }

  if (status === "open") return "Open for trading";
  if (status === "trading_halted") return "Trading halted";
  if (status === "closed") return "Closed, awaiting resolution";
  if (status === "pending_resolution") return "In community vote";
  if (status === "resolved") return "Resolved, awaiting finalization";

  return titleCaseStatus(market.status);
}
