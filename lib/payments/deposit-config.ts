const DEFAULT_MIN_USD = 5;
const DEFAULT_MAX_USD = 2500;
const DEFAULT_QUICK_AMOUNTS = [25, 50, 100];

function parsePositiveNumber(raw: string | undefined, fallbackValue: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackValue;
  }
  return parsed;
}

function parseQuickAmounts(raw: string | undefined): number[] {
  if (!raw) return [...DEFAULT_QUICK_AMOUNTS];

  const parsed = raw
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.round(value * 100) / 100);

  if (parsed.length === 0) return [...DEFAULT_QUICK_AMOUNTS];
  return Array.from(new Set(parsed)).sort((a, b) => a - b);
}

export type DepositConfig = {
  minUsd: number;
  maxUsd: number;
  quickAmountsUsd: number[];
};

export function getDepositConfig(): DepositConfig {
  const minUsd = parsePositiveNumber(process.env.DEPOSIT_MIN_USD, DEFAULT_MIN_USD);
  const maxUsdRaw = parsePositiveNumber(process.env.DEPOSIT_MAX_USD, DEFAULT_MAX_USD);
  const maxUsd = Math.max(maxUsdRaw, minUsd);

  return {
    minUsd,
    maxUsd,
    quickAmountsUsd: parseQuickAmounts(process.env.DEPOSIT_QUICK_AMOUNTS_USD).filter(
      (amount) => amount >= minUsd && amount <= maxUsd
    ),
  };
}
