import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

export const TRADE_SIDES = ["yes", "no"] as const;
export const TRADE_ACTIONS = ["buy", "sell"] as const;

const DEFAULT_MAX_SLIPPAGE_BPS = 500;

export type TradeSide = (typeof TRADE_SIDES)[number];
export type TradeAction = (typeof TRADE_ACTIONS)[number];

export type ValidatedTradeQuotePayload = {
  side: TradeSide;
  action: TradeAction;
  shares: number;
  maxSlippageBps: number;
};

export type ValidatedTradeExecutePayload = ValidatedTradeQuotePayload & {
  idempotencyKey: string;
};

export type TradeValidationResult<T> = { ok: true; data: T } | { ok: false; errors: string[] };

export type TradeQuoteRpcResult = {
  marketId: string;
  side: TradeSide;
  action: TradeAction;
  shares: number;
  feeBps: number;
  priceBeforeYes: number;
  priceAfterYes: number;
  priceBeforeSide: number;
  priceAfterSide: number;
  averagePrice: number;
  notional: number;
  feeAmount: number;
  netCashChange: number;
  slippageBps: number;
};

export type TradeExecuteRpcResult = TradeQuoteRpcResult & {
  reused: boolean;
  tradeFillId: string;
  userId: string;
  walletAvailableBalance: number;
  positionYesShares: number;
  positionNoShares: number;
  positionRealizedPnl: number;
  executedAt: string;
};

type ServiceCallError = {
  status: number;
  error: string;
  detail?: string;
  missingEnv?: string[];
};

type ServiceCallResult<T> = { ok: true; data: T } | ({ ok: false } & ServiceCallError);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function isOneOf<T extends readonly string[]>(value: string, allowed: T): value is T[number] {
  return (allowed as readonly string[]).includes(value);
}

function parseNumber(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(numeric)) return null;
  return numeric;
}

function parseMaxSlippageBps(raw: unknown, errors: string[]): number {
  if (raw === undefined || raw === null || raw === "") {
    return DEFAULT_MAX_SLIPPAGE_BPS;
  }

  const parsed = parseNumber(raw);
  if (parsed === null) {
    errors.push("maxSlippageBps must be a number.");
    return DEFAULT_MAX_SLIPPAGE_BPS;
  }

  const slippageBps = Math.floor(parsed);
  if (slippageBps < 0 || slippageBps > 10_000) {
    errors.push("maxSlippageBps must be between 0 and 10000.");
  }

  return slippageBps;
}

function parseRpcError(message: string): ServiceCallError {
  const trimmed = message.trim();
  const match = trimmed.match(/^\[(TRADE_[A-Z_]+)\]\s*(.*)$/);
  if (!match) {
    return {
      status: 500,
      error: "Trade operation failed.",
      detail: trimmed,
    };
  }

  const code = match[1];
  const detail = match[2] || "Trade operation failed.";

  if (code === "TRADE_VALIDATION") {
    return {
      status: 400,
      error: "Trade validation failed.",
      detail,
    };
  }

  if (code === "TRADE_FORBIDDEN") {
    return {
      status: 403,
      error: "Trade forbidden.",
      detail,
    };
  }

  if (code === "TRADE_NOT_FOUND") {
    return {
      status: 404,
      error: "Market not found.",
      detail,
    };
  }

  if (code === "TRADE_CONFLICT" || code === "TRADE_POSITION" || code === "TRADE_FUNDS") {
    return {
      status: 409,
      error: "Trade cannot be executed.",
      detail,
    };
  }

  return {
    status: 500,
    error: "Trade operation failed.",
    detail,
  };
}

function normalizeQuoteResult(raw: unknown): TradeQuoteRpcResult | null {
  if (!isRecord(raw)) return null;

  const marketId = cleanText(raw.marketId, 64);
  const sideRaw = cleanText(raw.side, 8).toLowerCase();
  const actionRaw = cleanText(raw.action, 8).toLowerCase();

  if (!marketId) return null;
  if (!isOneOf(sideRaw, TRADE_SIDES)) return null;
  if (!isOneOf(actionRaw, TRADE_ACTIONS)) return null;

  const shares = parseNumber(raw.shares);
  const feeBps = parseNumber(raw.feeBps);
  const priceBeforeYes = parseNumber(raw.priceBeforeYes);
  const priceAfterYes = parseNumber(raw.priceAfterYes);
  const priceBeforeSide = parseNumber(raw.priceBeforeSide);
  const priceAfterSide = parseNumber(raw.priceAfterSide);
  const averagePrice = parseNumber(raw.averagePrice);
  const notional = parseNumber(raw.notional);
  const feeAmount = parseNumber(raw.feeAmount);
  const netCashChange = parseNumber(raw.netCashChange);
  const slippageBps = parseNumber(raw.slippageBps);

  if (
    shares === null ||
    feeBps === null ||
    priceBeforeYes === null ||
    priceAfterYes === null ||
    priceBeforeSide === null ||
    priceAfterSide === null ||
    averagePrice === null ||
    notional === null ||
    feeAmount === null ||
    netCashChange === null ||
    slippageBps === null
  ) {
    return null;
  }

  return {
    marketId,
    side: sideRaw,
    action: actionRaw,
    shares,
    feeBps,
    priceBeforeYes,
    priceAfterYes,
    priceBeforeSide,
    priceAfterSide,
    averagePrice,
    notional,
    feeAmount,
    netCashChange,
    slippageBps,
  };
}

function normalizeExecuteResult(raw: unknown): TradeExecuteRpcResult | null {
  if (!isRecord(raw)) return null;

  const quote = normalizeQuoteResult(raw);
  if (!quote) return null;

  const reused = raw.reused === true;
  const tradeFillId = cleanText(raw.tradeFillId, 64);
  const userId = cleanText(raw.userId, 64);
  const walletAvailableBalance = parseNumber(raw.walletAvailableBalance);
  const positionYesShares = parseNumber(raw.positionYesShares);
  const positionNoShares = parseNumber(raw.positionNoShares);
  const positionRealizedPnl = parseNumber(raw.positionRealizedPnl);
  const executedAt = cleanText(raw.executedAt, 64);

  if (
    !tradeFillId ||
    !userId ||
    walletAvailableBalance === null ||
    positionYesShares === null ||
    positionNoShares === null ||
    positionRealizedPnl === null ||
    !executedAt
  ) {
    return null;
  }

  return {
    ...quote,
    reused,
    tradeFillId,
    userId,
    walletAvailableBalance,
    positionYesShares,
    positionNoShares,
    positionRealizedPnl,
    executedAt,
  };
}

export function validateTradeQuotePayload(raw: unknown): TradeValidationResult<ValidatedTradeQuotePayload> {
  if (!isRecord(raw)) {
    return {
      ok: false,
      errors: ["Invalid request body."],
    };
  }

  const errors: string[] = [];
  const sideRaw = cleanText(raw.side, 8).toLowerCase();
  const actionRaw = cleanText(raw.action, 8).toLowerCase();
  const sharesValue = parseNumber(raw.shares);
  const maxSlippageBps = parseMaxSlippageBps(raw.maxSlippageBps, errors);

  if (!isOneOf(sideRaw, TRADE_SIDES)) {
    errors.push("side must be one of: yes, no.");
  }

  if (!isOneOf(actionRaw, TRADE_ACTIONS)) {
    errors.push("action must be one of: buy, sell.");
  }

  if (sharesValue === null) {
    errors.push("shares must be a numeric value.");
  } else if (sharesValue <= 0) {
    errors.push("shares must be greater than zero.");
  } else if (sharesValue > 1_000_000) {
    errors.push("shares must be less than or equal to 1,000,000.");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      side: sideRaw as TradeSide,
      action: actionRaw as TradeAction,
      shares: sharesValue!,
      maxSlippageBps,
    },
  };
}

export function validateTradeExecutePayload(raw: unknown): TradeValidationResult<ValidatedTradeExecutePayload> {
  const quoteValidation = validateTradeQuotePayload(raw);
  if (!quoteValidation.ok) {
    return quoteValidation;
  }

  const record = raw as Record<string, unknown>;
  const idempotencyKey = cleanText(record.idempotencyKey, 140);
  const errors: string[] = [];

  if (!idempotencyKey) {
    errors.push("idempotencyKey is required.");
  } else if (!/^[A-Za-z0-9:_-]{8,120}$/.test(idempotencyKey)) {
    errors.push("idempotencyKey must be 8-120 characters and use only letters, numbers, :, _, -.");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      ...quoteValidation.data,
      idempotencyKey,
    },
  };
}

export async function quoteMarketTrade(input: {
  marketId: string;
  side: TradeSide;
  action: TradeAction;
  shares: number;
  maxSlippageBps: number;
}): Promise<ServiceCallResult<TradeQuoteRpcResult>> {
  if (!isSupabaseServiceEnvConfigured()) {
    return {
      ok: false,
      status: 503,
      error: "Trade quote unavailable: missing service role configuration.",
      missingEnv: getMissingSupabaseServiceEnv(),
    };
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc("quote_market_trade", {
    p_market_id: input.marketId,
    p_side: input.side,
    p_action: input.action,
    p_shares: input.shares,
    p_max_slippage_bps: input.maxSlippageBps,
  });

  if (error) {
    const mapped = parseRpcError(error.message);
    return {
      ok: false,
      ...mapped,
    };
  }

  const normalized = normalizeQuoteResult(data);
  if (!normalized) {
    return {
      ok: false,
      status: 500,
      error: "Trade quote unavailable.",
      detail: "RPC returned malformed quote payload.",
    };
  }

  return {
    ok: true,
    data: normalized,
  };
}

export async function executeMarketTrade(input: {
  marketId: string;
  userId: string;
  side: TradeSide;
  action: TradeAction;
  shares: number;
  maxSlippageBps: number;
  idempotencyKey: string;
}): Promise<ServiceCallResult<TradeExecuteRpcResult>> {
  if (!isSupabaseServiceEnvConfigured()) {
    return {
      ok: false,
      status: 503,
      error: "Trade execution unavailable: missing service role configuration.",
      missingEnv: getMissingSupabaseServiceEnv(),
    };
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc("execute_market_trade", {
    p_market_id: input.marketId,
    p_user_id: input.userId,
    p_side: input.side,
    p_action: input.action,
    p_shares: input.shares,
    p_idempotency_key: input.idempotencyKey,
    p_max_slippage_bps: input.maxSlippageBps,
  });

  if (error) {
    const mapped = parseRpcError(error.message);
    return {
      ok: false,
      ...mapped,
    };
  }

  const normalized = normalizeExecuteResult(data);
  if (!normalized) {
    return {
      ok: false,
      status: 500,
      error: "Trade execution failed.",
      detail: "RPC returned malformed execution payload.",
    };
  }

  return {
    ok: true,
    data: normalized,
  };
}
