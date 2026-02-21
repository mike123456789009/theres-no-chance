import type { ExecuteState } from "./types";

type TradeFeedbackBannersProps = {
  executeState: ExecuteState;
  isAuthenticated: boolean;
  isMarketOpen: boolean;
  isTradeEligible: boolean;
  tradeDisabledReason?: string;
  onDismissSuccess: () => void;
  onDismissError: () => void;
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

export function TradeFeedbackBanners(props: TradeFeedbackBannersProps) {
  const {
    executeState,
    isAuthenticated,
    isMarketOpen,
    isTradeEligible,
    tradeDisabledReason,
    onDismissSuccess,
    onDismissError,
  } = props;

  return (
    <>
      {executeState.status === "success" && executeState.data && (
        <div className="trade-success-banner" role="alert">
          <h3>Trade executed successfully!</h3>
          <div className="trade-success-details">
            <p>
              <strong>Order:</strong> {executeState.data.action.toUpperCase()} {formatShares(executeState.data.shares)}{" "}
              {executeState.data.side.toUpperCase()} shares
            </p>
            <p>
              <strong>Average price:</strong> {formatPercent(executeState.data.averagePrice)}
            </p>
            <p>
              <strong>Total cost:</strong> {formatCurrency(executeState.data.netCashChange)}
            </p>
            <p>
              <strong>Fee:</strong> {formatCurrency(executeState.data.feeAmount)} ({(executeState.data.feeBps / 100).toFixed(2)}%)
            </p>
            {executeState.data.reused && (
              <p className="trade-reused-notice">
                <em>Note: This was a duplicate request (idempotent).</em>
              </p>
            )}
          </div>
          <button type="button" onClick={onDismissSuccess} className="trade-dismiss-button">
            Dismiss
          </button>
        </div>
      )}

      {executeState.status === "error" && executeState.error && (
        <div className="trade-error-banner" role="alert">
          <p>
            <strong>Trade failed:</strong> {executeState.error}
          </p>
          <button type="button" onClick={onDismissError} className="trade-dismiss-button">
            Dismiss
          </button>
        </div>
      )}

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

      {isAuthenticated && isMarketOpen && !isTradeEligible && (
        <div className="trade-market-closed">
          <p>{tradeDisabledReason || "Your account does not currently have trade access for this market."}</p>
        </div>
      )}
    </>
  );
}
