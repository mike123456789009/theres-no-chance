export const DEFAULT_VENMO_FEE_PERCENT = 1.9;
export const DEFAULT_VENMO_FEE_FIXED_USD = 0.10;

export type VenmoFeeConfig = {
  feePercent: number;
  fixedFeeUsd: number;
};

export type VenmoFeeBreakdown = {
  grossAmountUsd: number;
  grossAmountCents: number;
  feeAmountUsd: number;
  feeAmountCents: number;
  netAmountUsd: number;
  netAmountCents: number;
  feePercent: number;
  feeFixedUsd: number;
};

function parseNonNegativeNumber(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function roundToCents(value: number): number {
  return Math.round(value * 100);
}

function centsToUsd(value: number): number {
  return value / 100;
}

export function getVenmoFeeConfig(): VenmoFeeConfig {
  return {
    feePercent: parseNonNegativeNumber(process.env.VENMO_FEE_PERCENT, DEFAULT_VENMO_FEE_PERCENT),
    fixedFeeUsd: parseNonNegativeNumber(process.env.VENMO_FEE_FIXED_USD, DEFAULT_VENMO_FEE_FIXED_USD),
  };
}

export function computeVenmoFeeBreakdown(grossAmountUsd: number, config = getVenmoFeeConfig()): VenmoFeeBreakdown {
  const grossAmountCents = Math.max(0, roundToCents(grossAmountUsd));
  const fixedFeeCents = Math.max(0, roundToCents(config.fixedFeeUsd));
  const feeAmountCentsRaw = Math.round((grossAmountCents * config.feePercent) / 100 + fixedFeeCents);
  const feeAmountCents = Math.min(grossAmountCents, Math.max(0, feeAmountCentsRaw));
  const netAmountCents = Math.max(0, grossAmountCents - feeAmountCents);

  return {
    grossAmountUsd: centsToUsd(grossAmountCents),
    grossAmountCents,
    feeAmountUsd: centsToUsd(feeAmountCents),
    feeAmountCents,
    netAmountUsd: centsToUsd(netAmountCents),
    netAmountCents,
    feePercent: config.feePercent,
    feeFixedUsd: config.fixedFeeUsd,
  };
}

export function isNetCreditAtLeastOneCent(breakdown: VenmoFeeBreakdown): boolean {
  return breakdown.netAmountCents >= 1;
}
