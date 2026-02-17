export const MARKET_CARD_SHADOW_TONES = ["mint", "sky", "lemon", "lavender", "peach", "rose"] as const;

export type MarketCardShadowTone = (typeof MARKET_CARD_SHADOW_TONES)[number];

export const MARKET_CARD_SHADOW_COLORS: Record<MarketCardShadowTone, string> = {
  mint: "#9ddfbe",
  sky: "#9ec8ef",
  lemon: "#e6d06d",
  lavender: "#c9b8eb",
  peach: "#e7b494",
  rose: "#dba9b8",
};
