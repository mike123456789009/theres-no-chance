import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type WalletAccountRow = {
  available_balance: number | string | null;
  reserved_balance: number | string | null;
} | null;

type PositionMarketAmmStateRow = {
  last_price_yes: number | string | null;
  last_price_no: number | string | null;
};

type PositionMarketRow = {
  question: string;
  status: string;
  close_time: string;
  market_amm_state: PositionMarketAmmStateRow[] | PositionMarketAmmStateRow | null;
} | null;

type PositionRow = {
  market_id: string;
  yes_shares: number | string | null;
  no_shares: number | string | null;
  average_entry_price_yes: number | string | null;
  average_entry_price_no: number | string | null;
  realized_pnl: number | string | null;
  updated_at: string;
  markets: PositionMarketRow | PositionMarketRow[];
};

type FillRow = {
  id: string;
  market_id: string;
  side: "yes" | "no";
  action: "buy" | "sell";
  shares: number | string | null;
  price: number | string | null;
  notional: number | string | null;
  fee_amount: number | string | null;
  created_at: string;
};

type MarketQuestionRow = {
  id: string;
  question: string;
};

export type PortfolioPositionDTO = {
  marketId: string;
  question: string;
  status: string;
  closeTime: string;
  yesShares: number;
  noShares: number;
  totalShares: number;
  averageEntryPriceYes: number | null;
  averageEntryPriceNo: number | null;
  realizedPnl: number;
  unrealizedPnl: number;
  markValue: number;
  lastPriceYes: number;
  lastPriceNo: number;
  updatedAt: string;
};

export type PortfolioFillDTO = {
  id: string;
  marketId: string;
  question: string;
  side: "yes" | "no";
  action: "buy" | "sell";
  shares: number;
  averagePrice: number;
  notional: number;
  feeAmount: number;
  cashDelta: number;
  executedAt: string;
};

export type PortfolioSnapshot = {
  wallet: {
    cashUsd: number;
    reservedUsd: number;
    totalUsd: number;
  };
  summary: {
    openPositions: number;
    markValueUsd: number;
    unrealizedPnlUsd: number;
    realizedPnlUsd: number;
    feesPaidUsd: number;
    tradeCount: number;
  };
  positions: PortfolioPositionDTO[];
  fills: PortfolioFillDTO[];
};

function toNumber(value: number | string | null | undefined, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeAmmState(
  value: PositionMarketAmmStateRow[] | PositionMarketAmmStateRow | null | undefined
): PositionMarketAmmStateRow | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

async function loadMarketQuestions(options: {
  supabase: SupabaseServerClient;
  marketIds: string[];
}): Promise<Map<string, string>> {
  const { supabase, marketIds } = options;
  const ids = unique(marketIds);
  if (ids.length === 0) return new Map<string, string>();

  const { data, error } = await supabase.from("markets").select("id, question").in("id", ids);

  if (error) {
    return new Map<string, string>();
  }

  const rows = (data ?? []) as MarketQuestionRow[];
  return new Map(rows.map((row) => [row.id, row.question]));
}

export async function getPortfolioSnapshot(options: {
  supabase: SupabaseServerClient;
  userId: string;
}): Promise<PortfolioSnapshot> {
  const { supabase, userId } = options;

  const { data: walletData, error: walletError } = await supabase
    .from("wallet_accounts")
    .select("available_balance, reserved_balance")
    .eq("user_id", userId)
    .maybeSingle();

  if (walletError) {
    throw new Error(`Unable to load wallet summary: ${walletError.message}`);
  }

  const walletRow = walletData as WalletAccountRow;
  const cashUsd = Math.max(0, toNumber(walletRow?.available_balance, 0));
  const reservedUsd = Math.max(0, toNumber(walletRow?.reserved_balance, 0));

  const { data: positionData, error: positionError } = await supabase
    .from("positions")
    .select(
      "market_id, yes_shares, no_shares, average_entry_price_yes, average_entry_price_no, realized_pnl, updated_at, markets(question, status, close_time, market_amm_state(last_price_yes, last_price_no))"
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(300);

  if (positionError) {
    throw new Error(`Unable to load portfolio positions: ${positionError.message}`);
  }

  const positionRows = ((positionData ?? []) as unknown) as PositionRow[];

  const positions: PortfolioPositionDTO[] = positionRows.map((row) => {
    const yesShares = Math.max(0, toNumber(row.yes_shares, 0));
    const noShares = Math.max(0, toNumber(row.no_shares, 0));
    const totalShares = yesShares + noShares;
    const averageEntryPriceYesRaw = toNumber(row.average_entry_price_yes, NaN);
    const averageEntryPriceNoRaw = toNumber(row.average_entry_price_no, NaN);
    const averageEntryPriceYes = Number.isFinite(averageEntryPriceYesRaw) ? averageEntryPriceYesRaw : null;
    const averageEntryPriceNo = Number.isFinite(averageEntryPriceNoRaw) ? averageEntryPriceNoRaw : null;
    const realizedPnl = toNumber(row.realized_pnl, 0);
    const market = Array.isArray(row.markets) ? row.markets[0] ?? null : row.markets;
    const ammState = normalizeAmmState(market?.market_amm_state);
    const lastPriceYes = clamp(toNumber(ammState?.last_price_yes, 0.5), 0, 1);
    const lastPriceNo = clamp(toNumber(ammState?.last_price_no, 1 - lastPriceYes), 0, 1);
    const markValue = yesShares * lastPriceYes + noShares * lastPriceNo;
    const costBasis =
      yesShares * (averageEntryPriceYes ?? 0) +
      noShares * (averageEntryPriceNo ?? 0);
    const unrealizedPnl = markValue - costBasis;

    return {
      marketId: row.market_id,
      question: market?.question ?? "Untitled market",
      status: market?.status ?? "unknown",
      closeTime: market?.close_time ?? "",
      yesShares,
      noShares,
      totalShares,
      averageEntryPriceYes,
      averageEntryPriceNo,
      realizedPnl,
      unrealizedPnl,
      markValue,
      lastPriceYes,
      lastPriceNo,
      updatedAt: row.updated_at,
    };
  });

  const questionByMarketId = new Map<string, string>(positions.map((position) => [position.marketId, position.question]));

  const { data: fillData, error: fillError } = await supabase
    .from("trade_fills")
    .select("id, market_id, side, action, shares, price, notional, fee_amount, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (fillError) {
    throw new Error(`Unable to load trade history: ${fillError.message}`);
  }

  const fillRows = ((fillData ?? []) as unknown) as FillRow[];
  const unresolvedMarketIds = unique(
    fillRows
      .map((fill) => fill.market_id)
      .filter((marketId) => !questionByMarketId.has(marketId))
  );

  if (unresolvedMarketIds.length > 0) {
    const extraQuestions = await loadMarketQuestions({
      supabase,
      marketIds: unresolvedMarketIds,
    });
    extraQuestions.forEach((value, key) => {
      questionByMarketId.set(key, value);
    });
  }

  const fills: PortfolioFillDTO[] = fillRows.map((row) => {
    const shares = Math.max(0, toNumber(row.shares, 0));
    const averagePrice = clamp(toNumber(row.price, 0), 0, 1);
    const notional = Math.max(0, toNumber(row.notional, 0));
    const feeAmount = Math.max(0, toNumber(row.fee_amount, 0));
    const cashDelta = row.action === "buy" ? -(notional + feeAmount) : notional - feeAmount;

    return {
      id: row.id,
      marketId: row.market_id,
      question: questionByMarketId.get(row.market_id) ?? row.market_id,
      side: row.side,
      action: row.action,
      shares,
      averagePrice,
      notional,
      feeAmount,
      cashDelta,
      executedAt: row.created_at,
    };
  });

  const markValueUsd = positions.reduce((sum, position) => sum + position.markValue, 0);
  const unrealizedPnlUsd = positions.reduce((sum, position) => sum + position.unrealizedPnl, 0);
  const realizedPnlUsd = positions.reduce((sum, position) => sum + position.realizedPnl, 0);
  const feesPaidUsd = fills.reduce((sum, fill) => sum + fill.feeAmount, 0);
  const openPositions = positions.filter((position) => position.totalShares > 0).length;

  return {
    wallet: {
      cashUsd,
      reservedUsd,
      totalUsd: cashUsd + reservedUsd,
    },
    summary: {
      openPositions,
      markValueUsd,
      unrealizedPnlUsd,
      realizedPnlUsd,
      feesPaidUsd,
      tradeCount: fills.length,
    },
    positions,
    fills,
  };
}

export function portfolioFillsToCsv(fills: PortfolioFillDTO[]): string {
  const header = [
    "executed_at",
    "market_id",
    "question",
    "side",
    "action",
    "shares",
    "average_price",
    "notional",
    "fee_amount",
    "cash_delta",
  ];

  const escapeCell = (value: string): string => {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const rows = fills.map((fill) =>
    [
      fill.executedAt,
      fill.marketId,
      fill.question,
      fill.side,
      fill.action,
      fill.shares.toString(),
      fill.averagePrice.toString(),
      fill.notional.toString(),
      fill.feeAmount.toString(),
      fill.cashDelta.toString(),
    ]
      .map((cell) => escapeCell(cell))
      .join(",")
  );

  return [header.join(","), ...rows].join("\n");
}
