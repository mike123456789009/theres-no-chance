import { afterEach, describe, expect, it } from "vitest";

import {
  computeVenmoFeeBreakdown,
  DEFAULT_VENMO_FEE_FIXED_USD,
  DEFAULT_VENMO_FEE_PERCENT,
  getVenmoFeeConfig,
  isNetCreditAtLeastOneCent,
} from "@/lib/payments/venmo-fees";

const ORIGINAL_ENV = { ...process.env };

describe("venmo fee breakdown", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("uses default 1.9% + $0.10 when env is not set", () => {
    delete process.env.VENMO_FEE_PERCENT;
    delete process.env.VENMO_FEE_FIXED_USD;

    const config = getVenmoFeeConfig();
    expect(config.feePercent).toBe(DEFAULT_VENMO_FEE_PERCENT);
    expect(config.fixedFeeUsd).toBe(DEFAULT_VENMO_FEE_FIXED_USD);

    const breakdown = computeVenmoFeeBreakdown(100, config);
    expect(breakdown.grossAmountUsd).toBe(100);
    expect(breakdown.feeAmountUsd).toBe(2);
    expect(breakdown.netAmountUsd).toBe(98);
  });

  it("supports env-configured fee overrides", () => {
    process.env.VENMO_FEE_PERCENT = "2.5";
    process.env.VENMO_FEE_FIXED_USD = "0.25";

    const config = getVenmoFeeConfig();
    const breakdown = computeVenmoFeeBreakdown(40, config);

    expect(config.feePercent).toBe(2.5);
    expect(config.fixedFeeUsd).toBe(0.25);
    expect(breakdown.feeAmountUsd).toBe(1.25);
    expect(breakdown.netAmountUsd).toBe(38.75);
  });

  it("rounds fee to nearest cent", () => {
    const breakdown = computeVenmoFeeBreakdown(10.01, {
      feePercent: 1.9,
      fixedFeeUsd: 0.10,
    });

    expect(breakdown.feeAmountUsd).toBe(0.29);
    expect(breakdown.netAmountUsd).toBe(9.72);
  });

  it("flags tiny payments that result in non-positive net credit", () => {
    const breakdown = computeVenmoFeeBreakdown(0.01, {
      feePercent: 1.9,
      fixedFeeUsd: 0.10,
    });

    expect(breakdown.netAmountUsd).toBe(0);
    expect(isNetCreditAtLeastOneCent(breakdown)).toBe(false);
  });
});
