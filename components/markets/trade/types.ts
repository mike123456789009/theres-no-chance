import type { TradeExecution, TradeQuote } from "@/lib/markets/trade-contract";

export type { TradeAction, TradeExecution, TradeQuote, TradeSide } from "@/lib/markets/trade-contract";

export type QuoteState = {
  status: "idle" | "loading" | "success" | "error";
  data: TradeQuote | null;
  error: string | null;
};

export type ExecuteState = {
  status: "idle" | "loading" | "success" | "error";
  data: TradeExecution | null;
  error: string | null;
};
