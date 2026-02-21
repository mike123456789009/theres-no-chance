export type TradeSide = "yes" | "no";
export type TradeAction = "buy" | "sell";

export type TradeQuote = {
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

export type TradeExecution = TradeQuote & {
  reused: boolean;
  tradeFillId: string;
  userId: string;
  walletAvailableBalance: number;
  positionYesShares: number;
  positionNoShares: number;
  positionRealizedPnl: number;
  executedAt: string;
};

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
