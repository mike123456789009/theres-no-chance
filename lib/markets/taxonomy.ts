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

export const CATEGORY_TO_CARD_TONE: Record<MarketCategoryKey, MarketCardShadowTone> = {
  trending: "rose",
  new: "sky",
  politics: "peach",
  sports: "mint",
  crypto: "lemon",
  finance: "sky",
  geopolitics: "lavender",
  tech: "mint",
  culture: "rose",
  world: "lavender",
  economy: "peach",
  climate_science: "lemon",
};

export const MARKET_PRIMARY_NAV_ITEMS = MARKET_CATEGORY_KEYS.map((category) => ({
  category,
  label: MARKET_CATEGORY_LABELS[category],
  query: MARKET_CATEGORY_SEARCH_QUERY[category],
}));
