import { logger } from "./logger";

export type ErrorCategory =
  | "validation"
  | "authentication"
  | "authorization"
  | "not_found"
  | "conflict"
  | "slippage"
  | "insufficient_funds"
  | "market_closed"
  | "service_unavailable"
  | "internal";

export type CategorizedError = {
  category: ErrorCategory;
  code: string;
  message: string;
  detail?: string;
  recoverable: boolean;
  suggestedAction?: string;
};

class ErrorTracker {
  private errorCounts: Map<ErrorCategory, number> = new Map();
  private lastErrors: Map<ErrorCategory, CategorizedError[]> = new Map();
  private maxErrorsPerCategory = 50;

  categorizeError(error: Error | string, context?: Record<string, unknown>): CategorizedError {
    const message = typeof error === "string" ? error : error.message;
    const lowerMessage = message.toLowerCase();

    let categorized: CategorizedError;

    if (lowerMessage.includes("validation") || lowerMessage.includes("invalid")) {
      categorized = {
        category: "validation",
        code: "VALIDATION_ERROR",
        message,
        recoverable: true,
        suggestedAction: "Check request parameters and retry with valid values.",
      };
    } else if (lowerMessage.includes("unauthorized") || lowerMessage.includes("authentication")) {
      categorized = {
        category: "authentication",
        code: "AUTH_ERROR",
        message,
        recoverable: true,
        suggestedAction: "Ensure user is logged in and retry.",
      };
    } else if (lowerMessage.includes("forbidden") || lowerMessage.includes("permission")) {
      categorized = {
        category: "authorization",
        code: "AUTHZ_ERROR",
        message,
        recoverable: false,
        suggestedAction: "User lacks required permissions.",
      };
    } else if (lowerMessage.includes("not found")) {
      categorized = {
        category: "not_found",
        code: "NOT_FOUND",
        message,
        recoverable: false,
        suggestedAction: "Verify market ID and try again.",
      };
    } else if (lowerMessage.includes("slippage")) {
      categorized = {
        category: "slippage",
        code: "SLIPPAGE_EXCEEDED",
        message,
        recoverable: true,
        suggestedAction: "Increase max slippage tolerance or reduce order size.",
      };
    } else if (lowerMessage.includes("funds") || lowerMessage.includes("balance")) {
      categorized = {
        category: "insufficient_funds",
        code: "INSUFFICIENT_FUNDS",
        message,
        recoverable: true,
        suggestedAction: "Add funds to wallet or reduce order size.",
      };
    } else if (lowerMessage.includes("closed") || lowerMessage.includes("trading")) {
      categorized = {
        category: "market_closed",
        code: "MARKET_CLOSED",
        message,
        recoverable: false,
        suggestedAction: "Market is not open for trading.",
      };
    } else if (
      lowerMessage.includes("unavailable") ||
      lowerMessage.includes("service") ||
      lowerMessage.includes("timeout")
    ) {
      categorized = {
        category: "service_unavailable",
        code: "SERVICE_UNAVAILABLE",
        message,
        recoverable: true,
        suggestedAction: "Retry request after a short delay.",
      };
    } else {
      categorized = {
        category: "internal",
        code: "INTERNAL_ERROR",
        message,
        recoverable: false,
        suggestedAction: "Contact support if issue persists.",
      };
    }

    this.trackError(categorized, context);
    return categorized;
  }

  private trackError(error: CategorizedError, context?: Record<string, unknown>): void {
    const count = this.errorCounts.get(error.category) || 0;
    this.errorCounts.set(error.category, count + 1);

    const categoryErrors = this.lastErrors.get(error.category) || [];
    categoryErrors.push(error);

    if (categoryErrors.length > this.maxErrorsPerCategory) {
      categoryErrors.shift();
    }

    this.lastErrors.set(error.category, categoryErrors);

    logger.error(`Trade error: ${error.category}`, {
      ...context,
      errorCode: error.code,
      errorMessage: error.message,
      recoverable: error.recoverable,
      suggestedAction: error.suggestedAction,
    });
  }

  getErrorStats(): Record<ErrorCategory, number> {
    const stats: Partial<Record<ErrorCategory, number>> = {};
    this.errorCounts.forEach((count, category) => {
      stats[category] = count;
    });
    return stats as Record<ErrorCategory, number>;
  }

  getRecentErrors(category?: ErrorCategory, limit = 10): CategorizedError[] {
    if (category) {
      const errors = this.lastErrors.get(category) || [];
      return errors.slice(-limit);
    }

    const allErrors: CategorizedError[] = [];
    this.lastErrors.forEach((errors) => {
      allErrors.push(...errors);
    });

    return allErrors.slice(-limit);
  }

  reset(): void {
    this.errorCounts.clear();
    this.lastErrors.clear();
    logger.info("Error tracking reset");
  }
}

export const errorTracker = new ErrorTracker();
