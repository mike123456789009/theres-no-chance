import type { MarketCardShadowTone } from "@/lib/markets/presentation";

export const MARKET_CATEGORY_KEYS = [
  "trending",
  "new",
  "politics",
  "sports",
  "crypto",
  "finance",
  "geopolitics",
  "tech",
  "culture",
  "world",
  "economy",
  "climate_science",
] as const;

export type MarketCategoryKey = (typeof MARKET_CATEGORY_KEYS)[number];

export const MARKET_CATEGORY_LABELS: Record<MarketCategoryKey, string> = {
  trending: "Trending",
  new: "New",
  politics: "Politics",
  sports: "Sports",
  crypto: "Crypto",
  finance: "Finance",
  geopolitics: "Geopolitics",
  tech: "Tech",
  culture: "Culture",
  world: "World",
  economy: "Economy",
  climate_science: "Climate & Science",
};

export const MARKET_CATEGORY_SEARCH_QUERY: Record<MarketCategoryKey, string | undefined> = {
  trending: undefined,
  new: "new",
  politics: "politics",
  sports: "sports",
  crypto: "crypto",
  finance: "finance",
  geopolitics: "geopolitics",
  tech: "tech",
  culture: "culture",
  world: "world",
  economy: "economy",
  climate_science: "climate science",
};

export const CATEGORY_TO_CARD_TONES: Record<MarketCategoryKey, readonly MarketCardShadowTone[]> = {
  trending: ["rose", "sky", "mint"],
  new: ["sky", "mint", "lemon"],
  politics: ["lavender", "rose", "peach"],
  sports: ["mint", "sky", "lemon"],
  crypto: ["lemon", "sky", "lavender"],
  finance: ["sky", "mint", "lavender"],
  geopolitics: ["lavender", "rose", "sky"],
  tech: ["mint", "sky", "lavender"],
  culture: ["rose", "lavender", "peach"],
  world: ["lavender", "sky", "mint"],
  economy: ["sky", "mint", "lemon"],
  climate_science: ["lemon", "mint", "sky"],
};

function hashText(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function pickCategoryCardTone(category: MarketCategoryKey, seed: string): MarketCardShadowTone {
  const tones = CATEGORY_TO_CARD_TONES[category];
  if (tones.length === 0) return "sky";

  const normalizedSeed = seed.trim().toLowerCase();
  const hash = normalizedSeed.length > 0 ? hashText(normalizedSeed) : 0;
  const index = hash % tones.length;
  return tones[index] ?? tones[0] ?? "sky";
}

export const MARKET_PRIMARY_NAV_ITEMS = MARKET_CATEGORY_KEYS.map((category) => ({
  category,
  label: MARKET_CATEGORY_LABELS[category],
}));
