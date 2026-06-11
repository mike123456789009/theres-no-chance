export const TRADE_SIDES = ["yes", "no"] as const;
export const TRADE_ACTIONS = ["buy", "sell"] as const;

export type TradeSide = (typeof TRADE_SIDES)[number];
export type TradeAction = (typeof TRADE_ACTIONS)[number];

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
