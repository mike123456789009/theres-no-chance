"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { MarketDetailChartPointDTO } from "@/lib/markets/read-markets";

const LIVE_REFRESH_INTERVAL_MS = 4_000;

type LiveMarketSnapshot = {
  chartPoints: MarketDetailChartPointDTO[];
  priceYes: number;
  priceNo: number;
  poolShares: number;
  yesShares: number;
  noShares: number;
  liquidityParameter: number;
};

type MarketLiveOverviewProps = {
  marketId: string;
  initialMarket: LiveMarketSnapshot;
};

type MarketDetailApiPayload = {
  market?: Partial<LiveMarketSnapshot>;
};

function formatPercent(value: number, maximumFractionDigits = 1): string {
  return `${(value * 100).toFixed(maximumFractionDigits)}%`;
}

function formatShares(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function formatShortDate(value: string | null): string {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatUpdateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseChartPoints(value: unknown): MarketDetailChartPointDTO[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((point) => {
      if (!point || typeof point !== "object") return null;

      const candidate = point as {
        timestamp?: unknown;
        priceYes?: unknown;
      };

      if (typeof candidate.timestamp !== "string" || typeof candidate.priceYes !== "number") {
        return null;
      }

      if (!Number.isFinite(candidate.priceYes)) {
        return null;
      }

      return {
        timestamp: candidate.timestamp,
        priceYes: clamp(candidate.priceYes, 0, 1),
      } as MarketDetailChartPointDTO;
    })
    .filter((point): point is MarketDetailChartPointDTO => point !== null);
}

function buildChartGeometry(points: MarketDetailChartPointDTO[]): {
  linePath: string;
  areaPath: string;
  markerX: number;
  markerY: number;
  yTicks: Array<{ y: number; label: string }>;
} {
  const width = 1280;
  const height = 540;
  const paddingX = 72;
  const paddingTop = 30;
  const paddingBottom = 48;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingTop - paddingBottom;

  const safePoints =
    points.length >= 2
      ? points.map((point) => ({
          priceYes: clamp(point.priceYes, 0, 1),
        }))
      : [{ priceYes: 0.5 }, { priceYes: 0.5 }];

  const coordinates = safePoints.map((point, index) => {
    const x = paddingX + (chartWidth * index) / (safePoints.length - 1);
    const y = paddingTop + (1 - point.priceYes) * chartHeight;
    return { x, y };
  });

  const linePath = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");

  const baselineY = paddingTop + chartHeight;
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];

  const areaPath = `${linePath} L ${last.x.toFixed(2)} ${baselineY.toFixed(2)} L ${first.x.toFixed(
    2
  )} ${baselineY.toFixed(2)} Z`;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((tick) => ({
    y: paddingTop + (1 - tick) * chartHeight,
    label: `${Math.round(tick * 100)}%`,
  }));

  return {
    linePath,
    areaPath,
    markerX: last.x,
    markerY: last.y,
    yTicks,
  };
}

export function MarketLiveOverview({ marketId, initialMarket }: MarketLiveOverviewProps) {
  const [market, setMarket] = useState<LiveMarketSnapshot>(initialMarket);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const refreshControllerRef = useRef<AbortController | null>(null);

  const refreshMarket = useCallback(async () => {
    if (refreshControllerRef.current) {
      refreshControllerRef.current.abort();
    }

    const controller = new AbortController();
    refreshControllerRef.current = controller;

    setIsRefreshing(true);

    try {
      const response = await fetch(`/api/markets/${marketId}`, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as MarketDetailApiPayload;
      const payloadMarket = payload.market;

      if (!payloadMarket) {
        return;
      }

      setMarket((previous) => {
        const nextChartPoints = parseChartPoints(payloadMarket.chartPoints);
        return {
          chartPoints: nextChartPoints.length > 0 ? nextChartPoints : previous.chartPoints,
          priceYes:
            typeof payloadMarket.priceYes === "number" ? clamp(payloadMarket.priceYes, 0, 1) : previous.priceYes,
          priceNo: typeof payloadMarket.priceNo === "number" ? clamp(payloadMarket.priceNo, 0, 1) : previous.priceNo,
          poolShares: typeof payloadMarket.poolShares === "number" ? payloadMarket.poolShares : previous.poolShares,
          yesShares: typeof payloadMarket.yesShares === "number" ? payloadMarket.yesShares : previous.yesShares,
          noShares: typeof payloadMarket.noShares === "number" ? payloadMarket.noShares : previous.noShares,
          liquidityParameter:
            typeof payloadMarket.liquidityParameter === "number"
              ? payloadMarket.liquidityParameter
              : previous.liquidityParameter,
        };
      });

      setLastUpdated(new Date());
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsRefreshing(false);
      }
    }
  }, [marketId]);

  useEffect(() => {
    void refreshMarket();

    const intervalId = window.setInterval(() => {
      void refreshMarket();
    }, LIVE_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
      refreshControllerRef.current?.abort();
    };
  }, [refreshMarket]);

  useEffect(() => {
    const handleRefreshEvent = () => {
      void refreshMarket();
    };

    window.addEventListener("tnc-market-refresh", handleRefreshEvent);
    return () => {
      window.removeEventListener("tnc-market-refresh", handleRefreshEvent);
    };
  }, [refreshMarket]);

  const chartGeometry = useMemo(() => buildChartGeometry(market.chartPoints), [market.chartPoints]);
  const chartStartLabel = formatShortDate(market.chartPoints[0]?.timestamp ?? null);
  const chartMidLabel = formatShortDate(market.chartPoints[Math.floor((market.chartPoints.length - 1) / 2)]?.timestamp ?? null);
  const chartEndLabel = formatShortDate(market.chartPoints[market.chartPoints.length - 1]?.timestamp ?? null);

  return (
    <div className="market-detail-market-pane">
      <article className="market-detail-strip-panel">
        <h2>Market strip</h2>
        <p className="market-detail-strip-label">Live implied odds</p>
        <p className="market-detail-stat market-detail-stat-yes">YES {formatPercent(market.priceYes, 1)}</p>
        <p className="market-detail-stat market-detail-stat-no">NO {formatPercent(market.priceNo, 1)}</p>

        <div className="market-detail-strip-grid">
          <p>
            <span>Pool shares</span>
            <strong>{formatShares(market.poolShares)}</strong>
          </p>
          <p>
            <span>YES shares</span>
            <strong>{formatShares(market.yesShares)}</strong>
          </p>
          <p>
            <span>NO shares</span>
            <strong>{formatShares(market.noShares)}</strong>
          </p>
          <p>
            <span>Liquidity parameter</span>
            <strong>{formatShares(market.liquidityParameter)}</strong>
          </p>
        </div>
      </article>

      <article className="market-detail-chart-panel">
        <div className="market-detail-chart-header">
          <h2>Price + timeline</h2>
          <p>
            YES probability
            <span className="market-detail-chart-live-status">
              {isRefreshing ? " • updating..." : ` • updated ${formatUpdateTime(lastUpdated)}`}
            </span>
          </p>
        </div>
        <div className="market-detail-chart-stage">
          <svg
            className="market-detail-chart-svg"
            viewBox="0 0 1280 540"
            role="img"
            aria-label={`YES probability currently ${formatPercent(market.priceYes, 1)}`}
          >
            {chartGeometry.yTicks.map((tick) => (
              <g key={tick.label}>
                <line x1="72" y1={tick.y} x2="1208" y2={tick.y} className="market-detail-chart-grid-line" />
                <text x="16" y={tick.y + 4} className="market-detail-chart-grid-label">
                  {tick.label}
                </text>
              </g>
            ))}
            <path d={chartGeometry.areaPath} className="market-detail-chart-area" />
            <path d={chartGeometry.linePath} className="market-detail-chart-line" />
            <circle cx={chartGeometry.markerX} cy={chartGeometry.markerY} r="8" className="market-detail-chart-marker" />
          </svg>
        </div>
        <div className="market-detail-chart-axis">
          <span>{chartStartLabel}</span>
          <span>{chartMidLabel}</span>
          <span>{chartEndLabel}</span>
        </div>
        <p className="market-detail-chart-note">Auto-refreshes every 4 seconds and after completed trades.</p>
      </article>
    </div>
  );
}
