"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  MARKET_CATEGORY_KEYS,
  MARKET_CATEGORY_SEARCH_QUERY,
  type MarketCategoryKey,
} from "@/lib/markets/taxonomy";

type NavItem = {
  category: MarketCategoryKey;
  label: string;
};

type MarketsCategoryNavProps = {
  items: NavItem[];
};

function cleanLower(value: string | null): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function parseCategory(value: string): MarketCategoryKey | null {
  if ((MARKET_CATEGORY_KEYS as readonly string[]).includes(value)) {
    return value as MarketCategoryKey;
  }
  return null;
}

const LEGACY_QUERY_TO_CATEGORY = new Map<string, MarketCategoryKey>(
  Object.entries(MARKET_CATEGORY_SEARCH_QUERY)
    .filter((entry): entry is [MarketCategoryKey, string] => typeof entry[1] === "string")
    .map(([category, query]) => [query.toLowerCase(), category as MarketCategoryKey])
);

function resolveActiveCategory(searchParams: URLSearchParams): MarketCategoryKey {
  const rawCategory = cleanLower(searchParams.get("category"));
  const parsedCategory = parseCategory(rawCategory);
  if (parsedCategory) return parsedCategory;

  const legacy = LEGACY_QUERY_TO_CATEGORY.get(cleanLower(searchParams.get("q")));
  return legacy ?? "trending";
}

function buildCategoryHref(searchParams: URLSearchParams, category: MarketCategoryKey): string {
  const next = new URLSearchParams(searchParams.toString());

  if (category === "trending") {
    next.delete("category");
  } else {
    next.set("category", category);
  }

  const rawSearch = cleanLower(next.get("q"));
  if (LEGACY_QUERY_TO_CATEGORY.has(rawSearch)) {
    next.delete("q");
  }

  const queryString = next.toString();
  return queryString ? `/markets?${queryString}` : "/markets";
}

export function MarketsCategoryNav({ items }: MarketsCategoryNavProps) {
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const [pendingCategory, setPendingCategory] = useState<MarketCategoryKey | null>(null);

  useEffect(() => {
    setPendingCategory(null);
  }, [searchParamsKey]);

  const activeCategory = useMemo(() => {
    return pendingCategory ?? resolveActiveCategory(searchParams);
  }, [pendingCategory, searchParams]);

  return (
    <nav className="markets-primary-nav" aria-label="Market categories">
      {items.map((item) => (
        <Link
          key={item.category}
          href={buildCategoryHref(searchParams, item.category)}
          prefetch={false}
          onClick={() => setPendingCategory(item.category)}
          className={activeCategory === item.category ? "markets-primary-link is-active" : "markets-primary-link"}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
