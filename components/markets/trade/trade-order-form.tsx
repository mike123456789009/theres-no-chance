import type { ExecuteState, QuoteState, TradeAction, TradeSide } from "./types";

type TradeOrderFormProps = {
  selectedSide: TradeSide;
  selectedAction: TradeAction;
  orderSize: string;
  maxSlippage: string;
  quoteState: QuoteState;
  executeState: ExecuteState;
  isTradeEligible: boolean;
  currentPrice: number;
  estimatedCost: number;
  onSetSelection: (side: TradeSide, action: TradeAction) => void;
  onSetOrderSize: (value: string) => void;
  onSetMaxSlippage: (value: string) => void;
  onExecuteTrade: () => void;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatShares(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

export function TradeOrderForm(props: TradeOrderFormProps) {
  const {
    selectedSide,
    selectedAction,
    orderSize,
    maxSlippage,
    quoteState,
    executeState,
    isTradeEligible,
    currentPrice,
    estimatedCost,
    onSetSelection,
    onSetOrderSize,
    onSetMaxSlippage,
    onExecuteTrade,
  } = props;

  return (
    <>
      <div className="market-detail-order-tabs">
        <button
          type="button"
          onClick={() => onSetSelection("yes", "buy")}
          className={`trade-order-tab trade-order-tab-buy ${
            selectedSide === "yes" && selectedAction === "buy" ? "active" : ""
          }`}
          disabled={!isTradeEligible || executeState.status === "loading"}
        >
          Buy YES
        </button>
        <button
          type="button"
          onClick={() => onSetSelection("no", "buy")}
          className={`trade-order-tab trade-order-tab-buy ${
            selectedSide === "no" && selectedAction === "buy" ? "active" : ""
          }`}
          disabled={!isTradeEligible || executeState.status === "loading"}
        >
          Buy NO
        </button>
        <button
          type="button"
          onClick={() => onSetSelection("yes", "sell")}
          className={`trade-order-tab trade-order-tab-sell ${
            selectedSide === "yes" && selectedAction === "sell" ? "active" : ""
          }`}
          disabled={!isTradeEligible || executeState.status === "loading"}
        >
          Sell YES
        </button>
        <button
          type="button"
          onClick={() => onSetSelection("no", "sell")}
          className={`trade-order-tab trade-order-tab-sell ${
            selectedSide === "no" && selectedAction === "sell" ? "active" : ""
          }`}
          disabled={!isTradeEligible || executeState.status === "loading"}
        >
          Sell NO
        </button>
      </div>

      <div className="trade-input-section">
        <label htmlFor="order-size">
          Order size (shares)
          <input
            type="number"
            id="order-size"
            value={orderSize}
            onChange={(event) => onSetOrderSize(event.target.value)}
            min="0.01"
            max="1000000"
            step="0.01"
            disabled={!isTradeEligible || executeState.status === "loading"}
            placeholder="Enter shares"
          />
        </label>

        <label htmlFor="max-slippage">
          Max slippage (%)
          <input
            type="number"
            id="max-slippage"
            value={maxSlippage}
            onChange={(event) => onSetMaxSlippage(event.target.value)}
            min="0"
            max="100"
            step="0.1"
            disabled={!isTradeEligible || executeState.status === "loading"}
            placeholder="5.0"
          />
        </label>
      </div>

      <div className="market-detail-order-grid">
        <p>
          <span>Current price</span>
          <strong>{formatPercent(currentPrice)}</strong>
        </p>
        <p>
          <span>Estimated cost</span>
          <strong>{formatCurrency(estimatedCost)}</strong>
        </p>

        {quoteState.status === "loading" && (
          <p className="trade-quote-loading">
            <span>Live quote</span>
            <strong>Loading...</strong>
          </p>
        )}

        {quoteState.status === "success" && quoteState.data && (
          <>
            <p>
              <span>Average price</span>
              <strong>{formatPercent(quoteState.data.averagePrice)}</strong>
            </p>
            <p>
              <span>Price impact</span>
              <strong>{formatPercent(quoteState.data.priceAfterSide - quoteState.data.priceBeforeSide)}</strong>
            </p>
            <p>
              <span>Fee amount</span>
              <strong>{formatCurrency(quoteState.data.feeAmount)}</strong>
            </p>
            <p>
              <span>Total cost</span>
              <strong>{formatCurrency(Math.abs(quoteState.data.netCashChange))}</strong>
            </p>
            <p>
              <span>Slippage</span>
              <strong>{(quoteState.data.slippageBps / 100).toFixed(2)}%</strong>
            </p>
          </>
        )}

        {quoteState.status === "error" && quoteState.error && (
          <p className="trade-quote-error">
            <span>Quote error</span>
            <strong>{quoteState.error}</strong>
          </p>
        )}
      </div>

      {isTradeEligible && (
        <button
          type="button"
          onClick={onExecuteTrade}
          className={`market-detail-action-button market-detail-action-button-${selectedAction}`}
          disabled={
            executeState.status === "loading" ||
            quoteState.status === "loading" ||
            quoteState.status === "error" ||
            !quoteState.data
          }
        >
          {executeState.status === "loading"
            ? "Executing trade..."
            : `${selectedAction.charAt(0).toUpperCase() + selectedAction.slice(1)} ${formatShares(
                parseFloat(orderSize) || 0
              )} ${selectedSide.toUpperCase()} shares`}
        </button>
      )}
    </>
  );
}
