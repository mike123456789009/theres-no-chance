import type { TradeQuoteRpcResult, TradeExecuteRpcResult } from "@/lib/markets/trade-engine";

export type QuoteRequest = {
  marketId: string;
  side: "yes" | "no";
  action: "buy" | "sell";
  shares: number;
  maxSlippageBps?: number;
};

export type ExecuteRequest = QuoteRequest & {
  idempotencyKey: string;
};

export type QuoteResponse = {
  quote: TradeQuoteRpcResult;
  market: {
    id: string;
    status: string;
    feeBps: number;
    priceYes: number;
    priceNo: number;
  };
  viewer: {
    userId: string;
  };
};

export type ExecuteResponse = {
  execution: TradeExecuteRpcResult;
  market: {
    id: string;
    status: string;
    feeBps: number;
  };
  viewer: {
    userId: string;
  };
};

export type ApiError = {
  error: string;
  detail?: string;
  details?: string[];
  missingEnv?: string[];
};

export async function fetchTradeQuote(request: QuoteRequest): Promise<QuoteResponse> {
  const response = await fetch(`/api/markets/${request.marketId}/trade/quote`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      side: request.side,
      action: request.action,
      shares: request.shares,
      maxSlippageBps: request.maxSlippageBps,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error((data as ApiError).error || "Failed to fetch quote");
  }

  return data as QuoteResponse;
}

export async function executeMarketTrade(request: ExecuteRequest): Promise<ExecuteResponse> {
  const response = await fetch(`/api/markets/${request.marketId}/trade/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": request.idempotencyKey,
    },
    body: JSON.stringify({
      side: request.side,
      action: request.action,
      shares: request.shares,
      maxSlippageBps: request.maxSlippageBps,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error((data as ApiError).error || "Failed to execute trade");
  }

  return data as ExecuteResponse;
}

export function generateIdempotencyKey(userId: string, marketId: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `${userId}:${marketId}:${timestamp}-${random}`;
}
