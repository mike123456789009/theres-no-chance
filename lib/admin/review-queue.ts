import { marketAccessBadge, normalizeAccessRules } from "@/lib/markets/view-access";
import { createServiceClient } from "@/lib/supabase/service";

import { toNumber } from "./helpers";

export type AdminQueueMarket = {
  id: string;
  question: string;
  status: "review" | "open";
  closeTime: string;
  createdAt: string;
  creatorId: string;
  tags: string[];
};

export type ProposedMarketPreview = {
  id: string;
  question: string;
  description: string;
  resolvesYesIf: string;
  resolvesNoIf: string;
  status: string;
  visibility: string;
  accessBadge: string;
  closeTime: string;
  createdAt: string;
  feeBps: number;
  creatorId: string;
  tags: string[];
  priceYes: number;
  priceNo: number;
  yesShares: number;
  noShares: number;
  poolShares: number;
  sources: Array<{
    label: string;
    url: string;
    type: string;
  }>;
};

type MarketRow = {
  id: string;
  question: string;
  status: "review" | "open";
  close_time: string;
  created_at: string;
  creator_id: string;
  tags: string[] | null;
};

type ProposedMarketRow = {
  id: string;
  question: string;
  description: string;
  resolves_yes_if: string;
  resolves_no_if: string;
  status: string;
  visibility: string;
  access_rules: Record<string, unknown> | null;
  close_time: string;
  created_at: string;
  fee_bps: number;
  creator_id: string;
  tags: string[] | null;
  market_amm_state:
    | {
        last_price_yes: number | string | null;
        last_price_no: number | string | null;
        yes_shares: number | string | null;
        no_shares: number | string | null;
      }
    | Array<{
        last_price_yes: number | string | null;
        last_price_no: number | string | null;
        yes_shares: number | string | null;
        no_shares: number | string | null;
      }>
    | null;
  market_sources:
    | Array<{
        source_label: string;
        source_url: string;
        source_type: string;
      }>
    | null;
};

function normalizeAmmState(raw: ProposedMarketRow["market_amm_state"]): {
  last_price_yes: number | string | null;
  last_price_no: number | string | null;
  yes_shares: number | string | null;
  no_shares: number | string | null;
} | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

export async function loadAdminQueueMarkets(): Promise<{
  reviewMarkets: AdminQueueMarket[];
  openMarkets: AdminQueueMarket[];
  errorMessage: string;
}> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("markets")
    .select("id, question, status, close_time, created_at, creator_id, tags")
    .in("status", ["review", "open"])
    .order("created_at", { ascending: true })
    .limit(120);

  if (error) {
    return {
      reviewMarkets: [],
      openMarkets: [],
      errorMessage: error.message,
    };
  }

  const rows = (data ?? []) as MarketRow[];
  const mapped = rows.map((market) => ({
    id: market.id,
    question: market.question,
    status: market.status,
    closeTime: market.close_time,
    createdAt: market.created_at,
    creatorId: market.creator_id,
    tags: market.tags ?? [],
  }));

  return {
    reviewMarkets: mapped.filter((market) => market.status === "review"),
    openMarkets: mapped.filter((market) => market.status === "open"),
    errorMessage: "",
  };
}

export async function loadProposedMarketPreviews(limit = 60): Promise<{
  proposals: ProposedMarketPreview[];
  errorMessage: string;
}> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("markets")
    .select(
      "id, question, description, resolves_yes_if, resolves_no_if, status, visibility, access_rules, close_time, created_at, fee_bps, creator_id, tags, market_amm_state(last_price_yes, last_price_no, yes_shares, no_shares), market_sources(source_label, source_url, source_type)"
    )
    .eq("status", "review")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return {
      proposals: [],
      errorMessage: error.message,
    };
  }

  const rows = (data ?? []) as ProposedMarketRow[];

  return {
    proposals: rows.map((row) => {
      const amm = normalizeAmmState(row.market_amm_state);
      const priceYes = Math.max(0, Math.min(1, toNumber(amm?.last_price_yes, 0.5)));
      const priceNo = Math.max(0, Math.min(1, toNumber(amm?.last_price_no, 1 - priceYes)));
      const yesShares = Math.max(0, toNumber(amm?.yes_shares, 0));
      const noShares = Math.max(0, toNumber(amm?.no_shares, 0));
      const accessRules = normalizeAccessRules(row.access_rules);
      return {
        id: row.id,
        question: row.question,
        description: row.description,
        resolvesYesIf: row.resolves_yes_if,
        resolvesNoIf: row.resolves_no_if,
        status: row.status,
        visibility: row.visibility,
        accessBadge: marketAccessBadge(row.visibility, accessRules),
        closeTime: row.close_time,
        createdAt: row.created_at,
        feeBps: row.fee_bps,
        creatorId: row.creator_id,
        tags: row.tags ?? [],
        priceYes,
        priceNo,
        yesShares,
        noShares,
        poolShares: yesShares + noShares,
        sources: (row.market_sources ?? []).map((source) => ({
          label: source.source_label,
          url: source.source_url,
          type: source.source_type,
        })),
      };
    }),
    errorMessage: "",
  };
}
