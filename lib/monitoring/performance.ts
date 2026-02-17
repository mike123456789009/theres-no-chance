import { logger } from "./logger";

type PerformanceEntry = {
  operation: string;
  durationMs: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
};

class PerformanceMonitor {
  private timers: Map<string, number> = new Map();
  private entries: PerformanceEntry[] = [];
  private maxEntries = 500;

  startTimer(operation: string, id: string): void {
    const key = `${operation}:${id}`;
    this.timers.set(key, Date.now());
  }

  endTimer(operation: string, id: string, metadata?: Record<string, unknown>): number | null {
    const key = `${operation}:${id}`;
    const startTime = this.timers.get(key);

    if (!startTime) {
      logger.warn("Timer not found", { operation, id });
      return null;
    }

    const durationMs = Date.now() - startTime;
    this.timers.delete(key);

    const entry: PerformanceEntry = {
      operation,
      durationMs,
      timestamp: new Date().toISOString(),
      metadata,
    };

    this.entries.push(entry);

    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    if (durationMs > 1000) {
      logger.warn("Slow operation detected", {
        operation,
        durationMs,
        ...metadata,
      });
    } else {
      logger.debug("Operation completed", {
        operation,
        durationMs,
        ...metadata,
      });
    }

    return durationMs;
  }

  getAverageDuration(operation: string, since?: string): number {
    let relevantEntries = this.entries.filter((e) => e.operation === operation);

    if (since) {
      relevantEntries = relevantEntries.filter((e) => e.timestamp >= since);
    }

    if (relevantEntries.length === 0) {
      return 0;
    }

    const total = relevantEntries.reduce((sum, e) => sum + e.durationMs, 0);
    return total / relevantEntries.length;
  }

  getPercentile(operation: string, percentile: number): number {
    const relevantEntries = this.entries.filter((e) => e.operation === operation);

    if (relevantEntries.length === 0) {
      return 0;
    }

    const sorted = relevantEntries.map((e) => e.durationMs).sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  clear(): void {
    this.timers.clear();
    this.entries = [];
    logger.info("Performance monitor cleared");
  }
}

export const performanceMonitor = new PerformanceMonitor();
