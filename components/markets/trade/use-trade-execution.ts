import { useState } from "react";

import type { ExecuteState, TradeAction, TradeSide } from "./types";

type UseTradeExecutionOptions = {
  marketId: string;
  selectedSide: TradeSide;
  selectedAction: TradeAction;
  orderSize: string;
  maxSlippage: string;
  isTradeEligible: boolean;
  tradeDisabledReason?: string;
  onTradeSuccess?: () => void;
};

type UseTradeExecutionResult = {
  executeState: ExecuteState;
  handleExecuteTrade: () => Promise<void>;
  handleDismissSuccess: () => void;
  handleDismissError: () => void;
};

function generateIdempotencyKey(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `trade-${timestamp}-${random}`;
}

export function useTradeExecution(options: UseTradeExecutionOptions): UseTradeExecutionResult {
  const {
    marketId,
    selectedSide,
    selectedAction,
    orderSize,
    maxSlippage,
    isTradeEligible,
    tradeDisabledReason,
    onTradeSuccess,
  } = options;

  const [executeState, setExecuteState] = useState<ExecuteState>({
    status: "idle",
    data: null,
    error: null,
  });

  const handleExecuteTrade = async () => {
    if (!isTradeEligible) {
      setExecuteState({
        status: "error",
        data: null,
        error: tradeDisabledReason || "Your account cannot trade this market.",
      });
      return;
    }

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
      onTradeSuccess?.();
    } catch (error) {
      setExecuteState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  return {
    executeState,
    handleExecuteTrade,
    handleDismissSuccess: () => {
      setExecuteState({ status: "idle", data: null, error: null });
    },
    handleDismissError: () => {
      setExecuteState((prev) => ({ ...prev, status: "idle", error: null }));
    },
  };
}
