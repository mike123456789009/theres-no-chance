import { MARKET_CATEGORY_KEYS, MARKET_CATEGORY_SEARCH_QUERY } from "@/lib/markets/taxonomy";
import { DISCOVERABLE_MARKET_STATUSES } from "@/lib/markets/view-access";

import {
  CATEGORY_MATCH_TERMS,
  MARKET_DISCOVERY_ACCESS_FILTERS,
  MARKET_DISCOVERY_SORTS,
  NEW_MARKET_WINDOW_MS,
  type MarketCardDTO,
  type MarketDiscoveryAccessFilter,
  type MarketDiscoveryCategoryFilter,
  type MarketDiscoveryQuery,
  type MarketDiscoverySort,
  type MarketDiscoveryStatusFilter,
} from "./types";

function cleanText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseSort(value: string): MarketDiscoverySort {
  if ((MARKET_DISCOVERY_SORTS as readonly string[]).includes(value)) {
    return value as MarketDiscoverySort;
  }
  return "volume";
}

function parseAccess(value: string): MarketDiscoveryAccessFilter {
  if ((MARKET_DISCOVERY_ACCESS_FILTERS as readonly string[]).includes(value)) {
    return value as MarketDiscoveryAccessFilter;
  }
  return "all";
}

function parseStatus(value: string): MarketDiscoveryStatusFilter {
  if (value === "all") return "all";
  if ((DISCOVERABLE_MARKET_STATUSES as readonly string[]).includes(value)) {
    return value as MarketDiscoveryStatusFilter;
  }
  return "all";
}

function parseCategory(value: string): MarketDiscoveryCategoryFilter {
  if ((MARKET_CATEGORY_KEYS as readonly string[]).includes(value)) {
    return value as MarketDiscoveryCategoryFilter;
  }
  return "trending";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsCategoryTerm(text: string, term: string): boolean {
  if (!text || !term) return false;

  if (term.includes(" ") || term.includes("-")) {
    return text.includes(term);
  }

  if (term.length <= 3) {
    const matcher = new RegExp(`\\b${escapeRegex(term)}\\b`, "i");
    return matcher.test(text);
  }

  return text.includes(term);
}

function inferLegacyCategoryFromSearch(search: string): MarketDiscoveryCategoryFilter | null {
  if (!search) return null;

  const normalized = search.trim().toLowerCase();
  for (const [category, query] of Object.entries(MARKET_CATEGORY_SEARCH_QUERY) as Array<
    [MarketDiscoveryCategoryFilter, string | undefined]
  >) {
    if (!query) continue;
    if (query.toLowerCase() === normalized) {
      return category;
    }
  }

  return null;
}

export function shouldIncludeForCategory(options: {
  category: MarketDiscoveryCategoryFilter;
  market: MarketCardDTO;
  nowMs: number;
}): boolean {
  const { category, market, nowMs } = options;

  if (category === "trending") {
    return true;
  }

  if (category === "new") {
    const createdMs = Date.parse(market.createdAt);
    if (!Number.isFinite(createdMs)) return false;
    return nowMs - createdMs <= NEW_MARKET_WINDOW_MS;
  }

  const matchTerms = CATEGORY_MATCH_TERMS[category];
  const tags = market.tags.map((tag) => tag.toLowerCase());
  const question = market.question.toLowerCase();

  return matchTerms.some((term) => {
    if (containsCategoryTerm(question, term)) return true;
    return tags.some((tag) => containsCategoryTerm(tag, term));
  });
}

export function shouldIncludeForSearch(market: MarketCardDTO, rawSearch: string): boolean {
  const normalizedSearch = rawSearch.trim().toLowerCase();
  if (!normalizedSearch) return true;

  const haystack = `${market.question.toLowerCase()} ${market.tags.join(" ").toLowerCase()}`;
  const tokens = normalizedSearch.split(/\s+/).filter((token) => token.length > 0);

  return tokens.every((token) => haystack.includes(token));
}

export function parseMarketDiscoveryQuery(searchParams: URLSearchParams): MarketDiscoveryQuery {
  const rawSearch = cleanText(searchParams.get("q")).slice(0, 100);
  const parsedCategory = parseCategory(cleanText(searchParams.get("category")).toLowerCase());
  const legacyCategory = inferLegacyCategoryFromSearch(rawSearch);
  const category = parsedCategory !== "trending" ? parsedCategory : legacyCategory ?? "trending";
  const search = category === (legacyCategory ?? "") ? "" : rawSearch;

  return {
    search,
    category,
    status: parseStatus(cleanText(searchParams.get("status")).toLowerCase()),
    access: parseAccess(cleanText(searchParams.get("access")).toLowerCase()),
    sort: parseSort(cleanText(searchParams.get("sort")).toLowerCase()),
  };
}

export function toUrlSearchParams(
  rawSearchParams: Record<string, string | string[] | undefined>
): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(rawSearchParams)) {
    if (Array.isArray(rawValue)) {
      const first = rawValue.find((item) => typeof item === "string" && item.trim().length > 0);
      if (first) params.set(key, first);
      continue;
    }

    if (typeof rawValue === "string" && rawValue.trim().length > 0) {
      params.set(key, rawValue);
    }
  }

  return params;
}
