export const DEFAULT_RESEARCH_MODEL = process.env.MARKET_RESEARCH_MODEL?.trim() || "gpt-5";
export const DEFAULT_SCOUT_MODEL = process.env.MARKET_RESEARCH_SCOUT_MODEL?.trim() || "gpt-5-mini";

export const QUALITY_CONFIDENCE_MIN = 0.62;
export const MIN_CLOSE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_CLOSE_WINDOW_MS = 45 * 24 * 60 * 60 * 1000;

export const DEFAULT_PUBLIC_MAX = Number.parseInt(process.env.MARKET_RESEARCH_PUBLIC_MAX || "20", 10) || 20;
export const DEFAULT_INSTITUTION_MAX_PER_ORG =
  Number.parseInt(process.env.MARKET_RESEARCH_INSTITUTION_MAX_PER_ORG || "10", 10) || 10;

export const OPENAI_CALL_TIMEOUT_MS =
  Number.parseInt(process.env.MARKET_RESEARCH_CALL_TIMEOUT_MS || "1800000", 10) || 1_800_000;
export const RUN_TIMEOUT_MS =
  Number.parseInt(process.env.MARKET_RESEARCH_RUN_TIMEOUT_MS || "3600000", 10) || 3_600_000;

export const DEFAULT_FEE_BPS = 200;

export const DEFAULT_EVIDENCE_RULES =
  "Primary resolution should rely on official sources listed on this market. Supporting sources may add context but cannot override official source outcomes.";

export const DEFAULT_DISPUTE_RULES =
  "Disputes may be filed within 48 hours of resolution. Platform admin reviews dispute evidence and issues a final determination.";
