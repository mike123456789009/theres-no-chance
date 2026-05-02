import { describe, expect, it } from "vitest";

import { formatMarketLifecycleLabel, isNoActionRetiredMarket } from "./lifecycle";

describe("market lifecycle labels", () => {
  it("formats active and resolution lifecycle statuses", () => {
    expect(formatMarketLifecycleLabel({ status: "open" })).toBe("Open for trading");
    expect(formatMarketLifecycleLabel({ status: "trading_halted" })).toBe("Trading halted");
    expect(formatMarketLifecycleLabel({ status: "closed" })).toBe("Closed, awaiting resolution");
    expect(formatMarketLifecycleLabel({ status: "pending_resolution" })).toBe("In community vote");
    expect(formatMarketLifecycleLabel({ status: "resolved" })).toBe("Resolved, awaiting finalization");
  });

  it("formats finalized outcomes and no-action retirement distinctly", () => {
    expect(formatMarketLifecycleLabel({ status: "finalized", resolutionOutcome: "yes" })).toBe("Finalized: YES");
    expect(formatMarketLifecycleLabel({ status: "finalized", resolutionOutcome: "no" })).toBe("Finalized: NO");
    expect(formatMarketLifecycleLabel({ status: "finalized", resolutionOutcome: "void" })).toBe("Finalized: VOID");
    expect(
      formatMarketLifecycleLabel({
        status: "finalized",
        resolutionOutcome: "void",
        finalizedAt: "2026-01-01T00:00:00.000Z",
        voidReason: "no_activity_at_close",
      })
    ).toBe("Retired: no action");
  });

  it("detects no-action retirement only after finalization", () => {
    expect(isNoActionRetiredMarket({ status: "finalized", voidReason: "no_activity_at_close" })).toBe(true);
    expect(isNoActionRetiredMarket({ status: "resolved", voidReason: "no_activity_at_close" })).toBe(false);
    expect(isNoActionRetiredMarket({ status: "finalized", voidReason: "manual_void" })).toBe(false);
  });
});
