import type { MarketAccessRules } from "@/lib/markets/access-rules";
import { MARKET_CARD_SHADOW_TONES, type MarketCardShadowTone } from "@/lib/markets/presentation";
import { cleanText, clamp, hashText, toNumber, toOptionalNumber } from "@/lib/shared/primitives";

import type { MarketAmmStateRow } from "./types";

export { cleanText, clamp, toNumber, toOptionalNumber };

export function isMarketSchemaMissingError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("could not find the table 'public.markets'") ||
    normalized.includes('relation "markets" does not exist') ||
    normalized.includes("schema cache")
  );
}

export function normalizeAmmState(raw: MarketAmmStateRow | MarketAmmStateRow[] | null): MarketAmmStateRow | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

export function resolveAmmSnapshot(raw: MarketAmmStateRow | MarketAmmStateRow[] | null): {
  ammState: MarketAmmStateRow | null;
  priceYes: number;
  priceNo: number;
  yesShares: number;
  noShares: number;
  poolShares: number;
} {
  const ammState = normalizeAmmState(raw);
  const priceYes = clamp(toNumber(ammState?.last_price_yes, 0.5), 0, 1);
  const explicitPriceNo = clamp(toNumber(ammState?.last_price_no, 1 - priceYes), 0, 1);
  const priceNo = clamp(explicitPriceNo || 1 - priceYes, 0, 1);
  const yesShares = Math.max(0, toNumber(ammState?.yes_shares, 0));
  const noShares = Math.max(0, toNumber(ammState?.no_shares, 0));

  return {
    ammState,
    priceYes,
    priceNo,
    yesShares,
    noShares,
    poolShares: yesShares + noShares,
  };
}

export function normalizeTags(raw: string[] | null): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((tag) => typeof tag === "string" && tag.trim().length > 0);
}

function fallbackCardShadowToneFromId(marketId: string): MarketCardShadowTone {
  const toneIndex = hashText(marketId) % MARKET_CARD_SHADOW_TONES.length;
  return MARKET_CARD_SHADOW_TONES[toneIndex];
}

function toCardShadowTone(value: unknown): MarketCardShadowTone | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if ((MARKET_CARD_SHADOW_TONES as readonly string[]).includes(normalized)) {
    return normalized as MarketCardShadowTone;
  }
  return null;
}

export function resolveCardShadowTone(accessRules: MarketAccessRules, marketId: string): MarketCardShadowTone {
  const explicitTone =
    toCardShadowTone(accessRules.cardShadowTone) ??
    toCardShadowTone(accessRules.cardShadowColor);

  return explicitTone ?? fallbackCardShadowToneFromId(marketId);
}
