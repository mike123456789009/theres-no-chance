"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { TradeQuoteRpcResult } from "@/lib/markets/trade-engine";
import { fetchTradeQuote, executeMarketTrade, generateIdempotencyKey } from "@/lib/app/trade-api-client";

type TradeSide = "yes" | "no";
type TradeAction = "buy" | "sell";

type Tab = `${TradeAction}_${TradeSide}`;

type TradingPanelProps = {
  marketId: string;
  marketStatus: string;
  currentPriceYes: number;
  currentPriceNo: number;
  feeBps: number;
  userId?: string;
};

type QuoteState = {
  quote: TradeQuoteRpcResult | null;
  loading: boolean;
  error: string | null;
};

type ExecutionState = {
  executing: boolean;
  success: boolean;
  error: string | null;
  result: any | null;
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
  return `${(value * 100).toFixed(1)}%`;
}

export function TradingPanel({
  marketId,
  marketStatus,
  currentPriceYes,
  currentPriceNo,
  feeBps,
  userId,
}: TradingPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("buy_yes");
  const [orderSize, setOrderSize] = useState<string>("25");
  const [maxSlippageBps, setMaxSlippageBps] = useState<string>("500");
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [quoteState, setQuoteState] = useState<QuoteState>({
    quote: null,
    loading: false,
    error: null,
  });
  const [executionState, setExecutionState] = useState<ExecutionState>({
    executing: false,
    success: false,
    error: null,
    result: null,
  });

  const quoteTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const side: TradeSide = activeTab.endsWith("_yes") ? "yes" : "no";
  const action: TradeAction = activeTab.startsWith("buy_") ? "buy" : "sell";
  const isMarketOpen = marketStatus === "open";
  const hasUserId = Boolean(userId);

  const fetchQuote = useCallback(async () => {
    const orderValue = parseFloat(orderSize);
    const slippageValue = parseFloat(maxSlippageBps);

    if (!orderValue || orderValue <= 0 || !slippageValue || slippageValue < 0) {
      setQuoteState({ quote: null, loading: false, error: null });
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setQuoteState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const price = side === "yes" ? currentPriceYes : currentPriceNo;
      const estimatedShares = price > 0 ? orderValue / price : 0;

      const response = await fetchTradeQuote({
        marketId,
        side,
        action,
        shares: estimatedShares,
        maxSlippageBps: Math.floor(slippageValue),
      });

      if (!abortControllerRef.current?.signal.aborted) {
        setQuoteState({
          quote: response.quote,
          loading: false,
          error: null,
        });
      }
    } catch (error) {
      if (!abortControllerRef.current?.signal.aborted) {
        setQuoteState({
          quote: null,
          loading: false,
          error: error instanceof Error ? error.message : "Failed to fetch quote",
        });
      }
    }
  }, [marketId, side, action, orderSize, maxSlippageBps, currentPriceYes, currentPriceNo]);

  useEffect(() => {
    if (!isMarketOpen || !hasUserId) {
      return;
    }

    if (quoteTimeoutRef.current) {
      clearTimeout(quoteTimeoutRef.current);
    }

    quoteTimeoutRef.current = setTimeout(() => {
      fetchQuote();
    }, 500);

    return () => {
      if (quoteTimeoutRef.current) {
        clearTimeout(quoteTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchQuote, isMarketOpen, hasUserId]);

  const handleExecuteTrade = async () => {
    if (!quoteState.quote || !userId) {
      return;
    }

    setExecutionState({
      executing: true,
      success: false,
      error: null,
      result: null,
    });

    try {
      const idempotencyKey = generateIdempotencyKey(userId, marketId);
      const result = await executeMarketTrade({
        marketId,
        side,
        action,
        shares: quoteState.quote.shares,
        maxSlippageBps: Math.floor(parseFloat(maxSlippageBps)),
        idempotencyKey,
      });

      setExecutionState({
        executing: false,
        success: true,
        error: null,
        result: result.execution,
      });

      setShowConfirmation(false);

      setTimeout(() => {
        setExecutionState((prev) => ({ ...prev, success: false, result: null }));
        window.location.reload();
      }, 3000);
    } catch (error) {
      setExecutionState({
        executing: false,
        success: false,
        error: error instanceof Error ? error.message : "Trade execution failed",
        result: null,
      });
    }
  };

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setQuoteState({ quote: null, loading: false, error: null });
    setExecutionState({ executing: false, success: false, error: null, result: null });
    setShowConfirmation(false);
  };

  const handleOrderSizeChange = (value: string) => {
    if (value === "" || /^\d*\.?\d{0,2}$/.test(value)) {
      setOrderSize(value);
      setExecutionState({ executing: false, success: false, error: null, result: null });
    }
  };

  const handleSlippageChange = (value: string) => {
    if (value === "" || /^\d*$/.test(value)) {
      setMaxSlippageBps(value);
    }
  };

  if (!isMarketOpen) {
    return (
      <article className="market-detail-action-panel">
        <h2>Trading</h2>
        <p>Market is not open for trading.</p>
      </article>
    );
  }

  if (!hasUserId) {
    return (
      <article className="market-detail-action-panel">
        <h2>Trading</h2>
        <p>Please log in to trade.</p>
      </article>
    );
  }

  if (executionState.success && executionState.result) {
    return (
      <article className="market-detail-action-panel">
        <h2>Trade Executed Successfully</h2>
        <div className="market-detail-order-grid">
          <p>
            <span>Fill ID</span>
            <strong>{executionState.result.tradeFillId}</strong>
          </p>
          <p>
            <span>Shares</span>
            <strong>{formatShares(executionState.result.shares)}</strong>
          </p>
          <p>
            <span>Average price</span>
            <strong>{formatPercent(executionState.result.averagePrice)}</strong>
          </p>
          <p>
            <span>Total cost</span>
            <strong>{formatCurrency(Math.abs(executionState.result.netCashChange))}</strong>
          </p>
        </div>
        <p style={{ marginTop: "1rem", fontSize: "0.875rem", color: "#666" }}>
          Page will reload to show updated position...
        </p>
      </article>
    );
  }

  if (showConfirmation && quoteState.quote) {
    return (
      <article className="market-detail-action-panel">
        <h2>Confirm Order</h2>
        <div className="market-detail-order-grid">
          <p>
            <span>Side</span>
            <strong>{side.toUpperCase()}</strong>
          </p>
          <p>
            <span>Action</span>
            <strong>{action.toUpperCase()}</strong>
          </p>
          <p>
            <span>Shares</span>
            <strong>{formatShares(quoteState.quote.shares)}</strong>
          </p>
          <p>
            <span>Average price</span>
            <strong>{formatPercent(quoteState.quote.averagePrice)}</strong>
          </p>
          <p>
            <span>Notional</span>
            <strong>{formatCurrency(quoteState.quote.notional)}</strong>
          </p>
          <p>
            <span>Fee ({(feeBps / 100).toFixed(2)}%)</span>
            <strong>{formatCurrency(quoteState.quote.feeAmount)}</strong>
          </p>
          <p>
            <span>Total cost</span>
            <strong>{formatCurrency(Math.abs(quoteState.quote.netCashChange))}</strong>
          </p>
          <p>
            <span>Slippage</span>
            <strong>{(quoteState.quote.slippageBps / 100).toFixed(2)}%</strong>
          </p>
        </div>

        {executionState.error && (
          <p style={{ color: "#d32f2f", marginTop: "1rem" }}>{executionState.error}</p>
        )}

        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
          <button
            className="market-detail-action-button"
            onClick={handleExecuteTrade}
            disabled={executionState.executing}
            style={{ flex: 1 }}
          >
            {executionState.executing ? "Executing..." : "Execute Trade"}
          </button>
          <button
            type="button"
            onClick={() => setShowConfirmation(false)}
            disabled={executionState.executing}
            style={{
              flex: 1,
              padding: "0.75rem 1.5rem",
              border: "1px solid #ccc",
              background: "#fff",
              cursor: executionState.executing ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="market-detail-action-panel">
      <h2>Trading</h2>
      <div className="market-detail-order-tabs">
        <button
          type="button"
          onClick={() => handleTabChange("buy_yes")}
          disabled={activeTab === "buy_yes"}
          style={{
            background: activeTab === "buy_yes" ? "#1976d2" : "#fff",
            color: activeTab === "buy_yes" ? "#fff" : "#000",
          }}
        >
          Buy YES
        </button>
        <button
          type="button"
          onClick={() => handleTabChange("buy_no")}
          disabled={activeTab === "buy_no"}
          style={{
            background: activeTab === "buy_no" ? "#1976d2" : "#fff",
            color: activeTab === "buy_no" ? "#fff" : "#000",
          }}
        >
          Buy NO
        </button>
        <button
          type="button"
          onClick={() => handleTabChange("sell_yes")}
          disabled={activeTab === "sell_yes"}
          style={{
            background: activeTab === "sell_yes" ? "#d32f2f" : "#fff",
            color: activeTab === "sell_yes" ? "#fff" : "#000",
          }}
        >
          Sell YES
        </button>
        <button
          type="button"
          onClick={() => handleTabChange("sell_no")}
          disabled={activeTab === "sell_no"}
          style={{
            background: activeTab === "sell_no" ? "#d32f2f" : "#fff",
            color: activeTab === "sell_no" ? "#fff" : "#000",
          }}
        >
          Sell NO
        </button>
      </div>

      <div style={{ marginTop: "1rem" }}>
        <label htmlFor="order-size" style={{ display: "block", marginBottom: "0.5rem" }}>
          Order Size (USD)
        </label>
        <input
          id="order-size"
          type="text"
          value={orderSize}
          onChange={(e) => handleOrderSizeChange(e.target.value)}
          placeholder="Enter amount in USD"
          style={{
            width: "100%",
            padding: "0.75rem",
            border: "1px solid #ccc",
            borderRadius: "4px",
          }}
        />
      </div>

      <div style={{ marginTop: "1rem" }}>
        <label htmlFor="max-slippage" style={{ display: "block", marginBottom: "0.5rem" }}>
          Max Slippage (bps)
        </label>
        <input
          id="max-slippage"
          type="text"
          value={maxSlippageBps}
          onChange={(e) => handleSlippageChange(e.target.value)}
          placeholder="500"
          style={{
            width: "100%",
            padding: "0.75rem",
            border: "1px solid #ccc",
            borderRadius: "4px",
          }}
        />
        <p style={{ fontSize: "0.75rem", color: "#666", marginTop: "0.25rem" }}>
          {Math.floor(parseFloat(maxSlippageBps) || 0) / 100}% max price movement
        </p>
      </div>

      {quoteState.loading && (
        <p style={{ marginTop: "1rem", color: "#666" }}>Loading quote...</p>
      )}

      {quoteState.error && (
        <p style={{ marginTop: "1rem", color: "#d32f2f" }}>{quoteState.error}</p>
      )}

      {quoteState.quote && !quoteState.loading && (
        <div className="market-detail-order-grid" style={{ marginTop: "1rem" }}>
          <p>
            <span>Est. shares</span>
            <strong>{formatShares(quoteState.quote.shares)}</strong>
          </p>
          <p>
            <span>Average price</span>
            <strong>{formatPercent(quoteState.quote.averagePrice)}</strong>
          </p>
          <p>
            <span>Notional</span>
            <strong>{formatCurrency(quoteState.quote.notional)}</strong>
          </p>
          <p>
            <span>Fee</span>
            <strong>{formatCurrency(quoteState.quote.feeAmount)}</strong>
          </p>
          <p>
            <span>Total cost</span>
            <strong>{formatCurrency(Math.abs(quoteState.quote.netCashChange))}</strong>
          </p>
          <p>
            <span>Slippage</span>
            <strong>{(quoteState.quote.slippageBps / 100).toFixed(2)}%</strong>
          </p>
        </div>
      )}

      <button
        className="market-detail-action-button"
        onClick={() => setShowConfirmation(true)}
        disabled={!quoteState.quote || quoteState.loading}
        style={{ marginTop: "1rem" }}
      >
        {quoteState.quote ? "Review Order" : "Enter order size for quote"}
      </button>
    </article>
  );
}
