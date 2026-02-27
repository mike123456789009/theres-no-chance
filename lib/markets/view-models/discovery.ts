import { PIXEL_AVATAR_OPTIONS } from "@/components/account/avatar-options";
import { MARKET_CARD_SHADOW_COLORS, type MarketCardShadowTone } from "@/lib/markets/presentation";
import type { MarketCardDTO } from "@/lib/markets/read-markets";
import { DISCOVERABLE_MARKET_STATUSES } from "@/lib/markets/view-access";

export const STATUS_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All status" },
  ...DISCOVERABLE_MARKET_STATUSES.map((status) => ({
    value: status,
    label: status.replace(/_/g, " "),
  })),
];

export const ACCESS_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All access" },
  { value: "public", label: "Public" },
  { value: "institution", label: "Institution" },
];

export const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "volume", label: "Highest volume" },
  { value: "closing_soon", label: "Closing soon" },
  { value: "newest", label: "Newest" },
  { value: "probability_high", label: "Highest yes" },
  { value: "probability_low", label: "Lowest yes" },
];

export const DEFAULT_AVATAR_URL = PIXEL_AVATAR_OPTIONS[0]?.url ?? "/assets/avatars/pixel-scout.svg";

export type ViewerAccountSummary = {
  portfolioUsd: number | null;
  cashUsd: number | null;
  avatarUrl: string;
  displayName: string;
  isAdmin: boolean;
};

export function formatDiscoveryDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatProbabilityPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

export function formatPoolShares(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatMarketStatus(value: string): string {
  return value.replace(/_/g, " ");
}

export function toneToColor(tone: MarketCardShadowTone): string {
  return MARKET_CARD_SHADOW_COLORS[tone];
}

export function shouldWarnAccess(market: MarketCardDTO): boolean {
  return market.accessRequiresLogin;
}

export function parseNumberish(value: number | string | null | undefined, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
