# Monitoring and Observability

## Overview

This document describes the monitoring and logging infrastructure for trade operations in the AI market maker platform.

## Components

### Logger (`lib/monitoring/logger.ts`)

Structured JSON logging for all trade operations.

**Features:**
- Structured JSON output for log aggregation
- Log levels: debug, info, warn, error
- Automatic timestamp generation
- Sensitive data redaction (idempotency keys, user IDs when appropriate)
- Development vs production mode handling

**Usage:**
```typescript
import { logger } from "@/lib/monitoring";

logger.info("Trade executed", {
  marketId: "market-123",
  side: "yes",
  action: "buy",
  shares: 100,
});

logger.error("Trade failed", {
  marketId: "market-123",
  errorCode: "INSUFFICIENT_FUNDS",
}, error);
```

### Metrics Collector (`lib/monitoring/metrics.ts`)

Collects trade performance metrics.

**Tracked Metrics:**
- Total trades (successful and failed)
- Trade volume (notional value)
- Average response times
- Error rates by type

**Usage:**
```typescript
import { metricsCollector } from "@/lib/monitoring";

metricsCollector.recordTrade({
  marketId: "market-123",
  side: "yes",
  action: "buy",
  shares: 100,
  notional: 51.5,
  success: true,
  durationMs: 245,
  timestamp: new Date().toISOString(),
});

const summary = metricsCollector.getSummary();
console.log(`Total trades: ${summary.totalTrades}`);
console.log(`Success rate: ${(summary.successfulTrades / summary.totalTrades * 100).toFixed(2)}%`);
```

### Error Tracker (`lib/monitoring/errors.ts`)

Categorizes and tracks errors with recovery suggestions.

**Error Categories:**
- `validation`: Invalid request parameters
- `authentication`: User not logged in
- `authorization`: Insufficient permissions
- `not_found`: Market or resource not found
- `conflict`: Order conflicts (duplicate, position issues)
- `slippage`: Slippage tolerance exceeded
- `insufficient_funds`: Wallet balance too low
- `market_closed`: Market not open for trading
- `service_unavailable`: Temporary service issues
- `internal`: Unexpected server errors

**Usage:**
```typescript
import { errorTracker } from "@/lib/monitoring";

try {
  // Trade operation
} catch (error) {
  const categorized = errorTracker.categorizeError(error, {
    marketId: "market-123",
    userId: "user-456",
  });
  
  console.log(`Error category: ${categorized.category}`);
  console.log(`Recoverable: ${categorized.recoverable}`);
  console.log(`Suggested action: ${categorized.suggestedAction}`);
}

const errorStats = errorTracker.getErrorStats();
console.log("Errors by category:", errorStats);
```

### Performance Monitor (`lib/monitoring/performance.ts`)

Tracks operation timing and performance.

**Features:**
- Timer management for async operations
- Average duration calculation
- Percentile calculation (p50, p95, p99)
- Slow operation detection (>1s warning)

**Usage:**
```typescript
import { performanceMonitor } from "@/lib/monitoring";

const requestId = "quote-123";
performanceMonitor.startTimer("quote_market_trade", requestId);

// Perform operation
await quoteMarketTrade(...);

const durationMs = performanceMonitor.endTimer("quote_market_trade", requestId, {
  marketId: "market-123",
  success: true,
});

const avgDuration = performanceMonitor.getAverageDuration("quote_market_trade");
const p95Duration = performanceMonitor.getPercentile("quote_market_trade", 95);
```

## Monitoring Integration

### Trade Engine Monitoring

The `trade-engine.ts` module includes comprehensive monitoring:

1. **Request Logging**: Every quote and execute request is logged with:
   - Unique request ID
   - Market ID
   - Trade parameters (side, action, shares, slippage)
   - Sanitized sensitive data

2. **Performance Tracking**: All operations are timed:
   - Quote API calls
   - Execute API calls
   - Database queries

3. **Error Tracking**: All errors are categorized:
   - RPC errors
   - Validation errors
   - Service configuration errors
   - Unexpected exceptions

4. **Metrics Collection**: Trade volume and frequency:
   - Successful trades
   - Failed trades with error types
   - Notional volume
   - Response times

### API Endpoint Monitoring

The quote and execute API endpoints should include:

1. **Request Logging**: Log incoming requests with sanitized data
2. **Response Logging**: Log responses (success and error)
3. **Performance Tracking**: Track API response times
4. **Error Handling**: Categorize and log all errors

## Log Format

All logs use structured JSON format:

```json
{
  "timestamp": "2026-02-17T03:46:00.000Z",
  "level": "info",
  "message": "Quote request completed",
  "context": {
    "requestId": "quote-1708142760000-abc123",
    "marketId": "market-123",
    "notional": 51.5,
    "slippageBps": 200,
    "durationMs": 245
  }
}
```

## Error Recovery Procedures

### Validation Errors
- **Category**: `validation`
- **Recoverable**: Yes
- **Action**: Return 400 status, provide specific error messages
- **User Action**: Fix request parameters and retry

### Authentication Errors
- **Category**: `authentication`
- **Recoverable**: Yes
- **Action**: Return 401 status
- **User Action**: Log in and retry

### Slippage Exceeded
- **Category**: `slippage`
- **Recoverable**: Yes
- **Action**: Return 409 status with slippage details
- **User Action**: Increase max slippage or reduce order size

### Insufficient Funds
- **Category**: `insufficient_funds`
- **Recoverable**: Yes
- **Action**: Return 409 status with balance information
- **User Action**: Add funds or reduce order size

### Service Unavailable
- **Category**: `service_unavailable`
- **Recoverable**: Yes (transient)
- **Action**: Return 503 status
- **User Action**: Retry after exponential backoff

### Internal Errors
- **Category**: `internal`
- **Recoverable**: No (requires investigation)
- **Action**: Return 500 status, log full error details
- **User Action**: Contact support

## Performance Targets

- **Quote API**: < 500ms p95
- **Execute API**: < 1000ms p95
- **Success Rate**: > 99.5%
- **Error Rate by Category**:
  - Validation: < 5%
  - Slippage: < 2%
  - Funds: < 1%
  - Service: < 0.1%
  - Internal: < 0.01%

## Monitoring Best Practices

1. **Never Log Sensitive Data**: Always redact:
   - Idempotency keys (log as `[REDACTED]`)
   - Full user IDs in public logs
   - Wallet balances in detail

2. **Use Structured Logging**: Always use JSON format with consistent field names

3. **Include Context**: Every log should include:
   - Request ID for tracing
   - Market ID
   - Operation type
   - Timestamp

4. **Track Performance**: Monitor response times and set alerts for:
   - p95 exceeding targets
   - Sudden increase in errors
   - Service unavailability

5. **Error Categorization**: Always categorize errors to enable:
   - Actionable alerts
   - Root cause analysis
   - User-friendly error messages

## Future Enhancements

1. **External Monitoring**:
   - Integrate with DataDog, NewRelic, or similar
   - Send metrics to time-series database
   - Set up alerting and dashboards

2. **Distributed Tracing**:
   - Add trace IDs across services
   - Implement OpenTelemetry
   - Track full request paths

3. **Real-time Dashboards**:
   - Live trade volume
   - Success/error rates
   - Performance metrics
   - Market health indicators

4. **Anomaly Detection**:
   - ML-based error rate prediction
   - Unusual trading pattern detection
   - Performance degradation alerts
