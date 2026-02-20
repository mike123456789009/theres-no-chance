"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type TradeSide = "yes" | "no";
type TradeAction = "buy" | "sell";

type TradeQuote = {
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

type TradeExecution = TradeQuote & {
  reused: boolean;
  tradeFillId: string;
  userId: string;
  walletAvailableBalance: number;
  positionYesShares: number;
  positionNoShares: number;
  positionRealizedPnl: number;
  executedAt: string;
};

type QuoteState = {
  status: "idle" | "loading" | "success" | "error";
  data: TradeQuote | null;
  error: string | null;
};

type ExecuteState = {
  status: "idle" | "loading" | "success" | "error";
  data: TradeExecution | null;
  error: string | null;
};

type TradeInterfaceProps = {
  marketId: string;
  marketStatus: string;
  currentPriceYes: number;
  currentPriceNo: number;
  viewerUserId?: string;
  isAuthenticated: boolean;
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

function generateIdempotencyKey(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `trade-${timestamp}-${random}`;
}

export function TradeInterface({
  marketId,
  marketStatus,
  currentPriceYes,
  currentPriceNo,
  viewerUserId,
  isAuthenticated,
}: TradeInterfaceProps) {
  const [selectedSide, setSelectedSide] = useState<TradeSide>("yes");
  const [selectedAction, setSelectedAction] = useState<TradeAction>("buy");
  const [orderSize, setOrderSize] = useState<string>("25");
  const [maxSlippage, setMaxSlippage] = useState<string>("5");
  const [quoteState, setQuoteState] = useState<QuoteState>({
    status: "idle",
    data: null,
    error: null,
  });
  const [executeState, setExecuteState] = useState<ExecuteState>({
    status: "idle",
    data: null,
    error: null,
  });

  const quoteAbortControllerRef = useRef<AbortController | null>(null);
  const quoteTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchQuote = useCallback(
    async (side: TradeSide, action: TradeAction, shares: number, slippageBps: number) => {
      if (quoteAbortControllerRef.current) {
        quoteAbortControllerRef.current.abort();
      }

      if (quoteTimeoutRef.current) {
        clearTimeout(quoteTimeoutRef.current);
      }

      const controller = new AbortController();
      quoteAbortControllerRef.current = controller;

      setQuoteState({ status: "loading", data: null, error: null });

      try {
        const response = await fetch(`/api/markets/${marketId}/trade/quote`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            side,
            action,
            shares,
            maxSlippageBps: slippageBps,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || errorData.detail || "Failed to fetch quote");
        }

        const data = await response.json();

        if (!controller.signal.aborted) {
          setQuoteState({
            status: "success",
            data: data.quote,
            error: null,
          });
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        if (!controller.signal.aborted) {
          setQuoteState({
            status: "error",
            data: null,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    },
    [marketId]
  );

  useEffect(() => {
    const shares = parseFloat(orderSize);
    const slippageBps = Math.round(parseFloat(maxSlippage) * 100);

    if (isNaN(shares) || shares <= 0 || shares > 1_000_000) {
      setQuoteState({ status: "idle", data: null, error: null });
      return;
    }

    if (isNaN(slippageBps) || slippageBps < 0 || slippageBps > 10_000) {
      setQuoteState({ status: "idle", data: null, error: null });
      return;
    }

    if (quoteTimeoutRef.current) {
      clearTimeout(quoteTimeoutRef.current);
    }

    quoteTimeoutRef.current = setTimeout(() => {
      fetchQuote(selectedSide, selectedAction, shares, slippageBps);
    }, 300);

    return () => {
      if (quoteTimeoutRef.current) {
        clearTimeout(quoteTimeoutRef.current);
      }
    };
  }, [orderSize, maxSlippage, selectedSide, selectedAction, fetchQuote]);

  const handleExecuteTrade = async () => {
    const shares = parseFloat(orderSize);
    const slippageBps = Math.round(parseFloat(maxSlippage) * 100);

    if (isNaN(shares) || shares <= 0 || shares > 1_000_000) {
      setExecuteState({
        status: "error",
        data: null,
        error: "Invalid order size. Must be between 0 and 1,000,000 shares.",
      });
      return;
    }

    if (isNaN(slippageBps) || slippageBps < 0 || slippageBps > 10_000) {
      setExecuteState({
        status: "error",
        data: null,
        error: "Invalid max slippage. Must be between 0% and 100%.",
      });
      return;
    }

    setExecuteState({ status: "loading", data: null, error: null });

    try {
      const idempotencyKey = generateIdempotencyKey();

      const response = await fetch(`/api/markets/${marketId}/trade/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          side: selectedSide,
          action: selectedAction,
          shares,
          maxSlippageBps: slippageBps,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.detail || "Failed to execute trade");
      }

      const data = await response.json();

      setExecuteState({
        status: "success",
        data: data.execution,
        error: null,
      });

      window.dispatchEvent(new CustomEvent("tnc-market-refresh"));

      setOrderSize("25");
      setQuoteState({ status: "idle", data: null, error: null });
    } catch (error) {
      setExecuteState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleDismissSuccess = () => {
    setExecuteState({ status: "idle", data: null, error: null });
  };

  const handleDismissError = () => {
    setExecuteState((prev) => ({ ...prev, status: "idle", error: null }));
  };

  const isMarketOpen = marketStatus === "open";
  const canTrade = isAuthenticated && isMarketOpen;

  const currentPrice = selectedSide === "yes" ? currentPriceYes : currentPriceNo;
  const estimatedShares = parseFloat(orderSize) || 0;
  const estimatedCost = estimatedShares * currentPrice;

  return (
    <article className="market-detail-action-panel">
      <h2>Trade interface</h2>

      {executeState.status === "success" && executeState.data && (
        <div className="trade-success-banner" role="alert">
          <h3>Trade executed successfully!</h3>
          <div className="trade-success-details">
            <p>
              <strong>Order:</strong> {executeState.data.action.toUpperCase()}{" "}
              {formatShares(executeState.data.shares)} {executeState.data.side.toUpperCase()} shares
            </p>
            <p>
              <strong>Average price:</strong> {formatPercent(executeState.data.averagePrice)}
            </p>
            <p>
              <strong>Total cost:</strong> {formatCurrency(executeState.data.netCashChange)}
            </p>
            <p>
              <strong>Fee:</strong> {formatCurrency(executeState.data.feeAmount)} (
              {(executeState.data.feeBps / 100).toFixed(2)}%)
            </p>
            {executeState.data.reused && (
              <p className="trade-reused-notice">
                <em>Note: This was a duplicate request (idempotent).</em>
              </p>
            )}
          </div>
          <button type="button" onClick={handleDismissSuccess} className="trade-dismiss-button">
            Dismiss
          </button>
        </div>
      )}

      {executeState.status === "error" && executeState.error && (
        <div className="trade-error-banner" role="alert">
          <p>
            <strong>Trade failed:</strong> {executeState.error}
          </p>
          <button type="button" onClick={handleDismissError} className="trade-dismiss-button">
            Dismiss
          </button>
        </div>
      )}

      <div className="market-detail-order-tabs">
        <button
          type="button"
          onClick={() => {
            setSelectedSide("yes");
            setSelectedAction("buy");
          }}
          className={selectedSide === "yes" && selectedAction === "buy" ? "active" : ""}
          disabled={!canTrade || executeState.status === "loading"}
        >
          Buy YES
        </button>
        <button
          type="button"
          onClick={() => {
            setSelectedSide("no");
            setSelectedAction("buy");
          }}
          className={selectedSide === "no" && selectedAction === "buy" ? "active" : ""}
          disabled={!canTrade || executeState.status === "loading"}
        >
          Buy NO
        </button>
        <button
          type="button"
          onClick={() => {
            setSelectedSide("yes");
            setSelectedAction("sell");
          }}
          className={selectedSide === "yes" && selectedAction === "sell" ? "active" : ""}
          disabled={!canTrade || executeState.status === "loading"}
        >
          Sell YES
        </button>
        <button
          type="button"
          onClick={() => {
            setSelectedSide("no");
            setSelectedAction("sell");
          }}
          className={selectedSide === "no" && selectedAction === "sell" ? "active" : ""}
          disabled={!canTrade || executeState.status === "loading"}
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
            onChange={(e) => setOrderSize(e.target.value)}
            min="0.01"
            max="1000000"
            step="0.01"
            disabled={!canTrade || executeState.status === "loading"}
            placeholder="Enter shares"
          />
        </label>

        <label htmlFor="max-slippage">
          Max slippage (%)
          <input
            type="number"
            id="max-slippage"
            value={maxSlippage}
            onChange={(e) => setMaxSlippage(e.target.value)}
            min="0"
            max="100"
            step="0.1"
            disabled={!canTrade || executeState.status === "loading"}
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

      {!isAuthenticated && (
        <div className="trade-auth-required">
          <p>Create an account to execute trades.</p>
          <div className="market-detail-action-links">
            <a href="/signup">Create account</a>
            <a href="/login">Log in</a>
          </div>
        </div>
      )}

      {isAuthenticated && !isMarketOpen && (
        <div className="trade-market-closed">
          <p>This market is not open for trading.</p>
        </div>
      )}

      {canTrade && (
        <button
          type="button"
          onClick={handleExecuteTrade}
          className="market-detail-action-button"
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
    </article>
  );
}
