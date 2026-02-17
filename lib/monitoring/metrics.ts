import { logger } from "./logger";

type TradeMetric = {
  marketId: string;
  side: string;
  action: string;
  shares: number;
  notional?: number;
  success: boolean;
  errorType?: string;
  durationMs: number;
  timestamp: string;
};

type MetricsSummary = {
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  totalVolume: number;
  averageResponseTime: number;
  errorsByType: Record<string, number>;
};

class MetricsCollector {
  private metrics: TradeMetric[] = [];
  private maxMetricsSize = 1000;

  recordTrade(metric: TradeMetric): void {
    this.metrics.push(metric);

    if (this.metrics.length > this.maxMetricsSize) {
      this.metrics = this.metrics.slice(-this.maxMetricsSize);
    }

    logger.info("Trade metric recorded", {
      marketId: metric.marketId,
      side: metric.side,
      action: metric.action,
      shares: metric.shares,
      success: metric.success,
      durationMs: metric.durationMs,
    });
  }

  getSummary(sinceTimestamp?: string): MetricsSummary {
    const relevantMetrics = sinceTimestamp
      ? this.metrics.filter((m) => m.timestamp >= sinceTimestamp)
      : this.metrics;

    const summary: MetricsSummary = {
      totalTrades: relevantMetrics.length,
      successfulTrades: relevantMetrics.filter((m) => m.success).length,
      failedTrades: relevantMetrics.filter((m) => !m.success).length,
      totalVolume: relevantMetrics.reduce((sum, m) => sum + (m.notional || 0), 0),
      averageResponseTime:
        relevantMetrics.length > 0
          ? relevantMetrics.reduce((sum, m) => sum + m.durationMs, 0) / relevantMetrics.length
          : 0,
      errorsByType: {},
    };

    relevantMetrics
      .filter((m) => !m.success && m.errorType)
      .forEach((m) => {
        const errorType = m.errorType!;
        summary.errorsByType[errorType] = (summary.errorsByType[errorType] || 0) + 1;
      });

    return summary;
  }

  getRecentMetrics(count: number): TradeMetric[] {
    return this.metrics.slice(-count);
  }

  clear(): void {
    this.metrics = [];
    logger.info("Metrics cleared");
  }
}

export const metricsCollector = new MetricsCollector();
export type { TradeMetric, MetricsSummary };
