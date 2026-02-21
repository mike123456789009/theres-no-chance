"use client";

import { TradeFeedbackBanners } from "@/components/markets/trade/trade-feedback-banners";
import { TradeOrderForm } from "@/components/markets/trade/trade-order-form";
import { useTradeExecution } from "@/components/markets/trade/use-trade-execution";
import { useTradeQuote } from "@/components/markets/trade/use-trade-quote";

type TradeInterfaceProps = {
  marketId: string;
  marketStatus: string;
  currentPriceYes: number;
  currentPriceNo: number;
  viewerUserId?: string;
  isAuthenticated: boolean;
  canTrade?: boolean;
  tradeDisabledReason?: string;
};

export function TradeInterface(props: TradeInterfaceProps) {
  const {
    marketId,
    marketStatus,
    currentPriceYes,
    currentPriceNo,
    isAuthenticated,
    canTrade,
    tradeDisabledReason,
  } = props;

  const isMarketOpen = marketStatus === "open";
  const isTradeEligible = isAuthenticated && isMarketOpen && (canTrade ?? true);

  const quote = useTradeQuote({
    marketId,
    isTradeEligible,
  });

  const execution = useTradeExecution({
    marketId,
    selectedSide: quote.selectedSide,
    selectedAction: quote.selectedAction,
    orderSize: quote.orderSize,
    maxSlippage: quote.maxSlippage,
    isTradeEligible,
    tradeDisabledReason,
    onTradeSuccess: quote.resetAfterSuccessfulTrade,
  });

  const currentPrice = quote.selectedSide === "yes" ? currentPriceYes : currentPriceNo;
  const estimatedShares = parseFloat(quote.orderSize) || 0;
  const estimatedCost = estimatedShares * currentPrice;

  return (
    <article className="market-detail-action-panel">
      <h2>Trade interface</h2>

      <TradeFeedbackBanners
        executeState={execution.executeState}
        isAuthenticated={isAuthenticated}
        isMarketOpen={isMarketOpen}
        isTradeEligible={isTradeEligible}
        tradeDisabledReason={tradeDisabledReason}
        onDismissSuccess={execution.handleDismissSuccess}
        onDismissError={execution.handleDismissError}
      />

      <TradeOrderForm
        selectedSide={quote.selectedSide}
        selectedAction={quote.selectedAction}
        orderSize={quote.orderSize}
        maxSlippage={quote.maxSlippage}
        quoteState={quote.quoteState}
        executeState={execution.executeState}
        isTradeEligible={isTradeEligible}
        currentPrice={currentPrice}
        estimatedCost={estimatedCost}
        onSetSelection={quote.setSelection}
        onSetOrderSize={quote.setOrderSize}
        onSetMaxSlippage={quote.setMaxSlippage}
        onExecuteTrade={() => {
          void execution.handleExecuteTrade();
        }}
      />
    </article>
  );
}
