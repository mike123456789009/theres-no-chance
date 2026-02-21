import { useCallback, useEffect, useRef, useState } from "react";

import type { QuoteState, TradeAction, TradeSide } from "./types";

type UseTradeQuoteOptions = {
  marketId: string;
  isTradeEligible: boolean;
};

type UseTradeQuoteResult = {
  selectedSide: TradeSide;
  selectedAction: TradeAction;
  orderSize: string;
  maxSlippage: string;
  quoteState: QuoteState;
  setSelectedSide: (side: TradeSide) => void;
  setSelectedAction: (action: TradeAction) => void;
  setOrderSize: (value: string) => void;
  setMaxSlippage: (value: string) => void;
  setSelection: (side: TradeSide, action: TradeAction) => void;
  resetAfterSuccessfulTrade: () => void;
};

export function useTradeQuote(options: UseTradeQuoteOptions): UseTradeQuoteResult {
  const { marketId, isTradeEligible } = options;
  const [selectedSide, setSelectedSide] = useState<TradeSide>("yes");
  const [selectedAction, setSelectedAction] = useState<TradeAction>("buy");
  const [orderSize, setOrderSize] = useState<string>("25");
  const [maxSlippage, setMaxSlippage] = useState<string>("5");
  const [quoteState, setQuoteState] = useState<QuoteState>({
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
    if (!isTradeEligible) {
      setQuoteState({ status: "idle", data: null, error: null });
      return;
    }

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
      void fetchQuote(selectedSide, selectedAction, shares, slippageBps);
    }, 300);

    return () => {
      if (quoteTimeoutRef.current) {
        clearTimeout(quoteTimeoutRef.current);
      }
    };
  }, [orderSize, maxSlippage, selectedSide, selectedAction, fetchQuote, isTradeEligible]);

  useEffect(() => {
    return () => {
      if (quoteTimeoutRef.current) {
        clearTimeout(quoteTimeoutRef.current);
      }

      if (quoteAbortControllerRef.current) {
        quoteAbortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    selectedSide,
    selectedAction,
    orderSize,
    maxSlippage,
    quoteState,
    setSelectedSide,
    setSelectedAction,
    setOrderSize,
    setMaxSlippage,
    setSelection: (side: TradeSide, action: TradeAction) => {
      setSelectedSide(side);
      setSelectedAction(action);
    },
    resetAfterSuccessfulTrade: () => {
      setOrderSize("25");
      setQuoteState({ status: "idle", data: null, error: null });
    },
  };
}
