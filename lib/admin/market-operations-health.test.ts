import { describe, expect, it } from "vitest";

import { countNoActionRetirementCandidates } from "./market-operations-health";

describe("market operations health", () => {
  it("counts only closed no-action markets that have reached close time", () => {
    const nowIso = "2026-05-02T10:00:00.000Z";
    const markets = [
      {
        id: "eligible",
        status: "closed",
        close_time: "2026-05-02T09:00:00.000Z",
        finalized_at: null,
      },
      {
        id: "with-trade",
        status: "closed",
        close_time: "2026-05-02T09:00:00.000Z",
        finalized_at: null,
      },
      {
        id: "with-bond",
        status: "closed",
        close_time: "2026-05-02T09:00:00.000Z",
        finalized_at: null,
      },
      {
        id: "already-finalized",
        status: "finalized",
        close_time: "2026-05-02T09:00:00.000Z",
        finalized_at: "2026-05-02T09:30:00.000Z",
      },
      {
        id: "future-close",
        status: "closed",
        close_time: "2026-05-02T11:00:00.000Z",
        finalized_at: null,
      },
    ];

    expect(
      countNoActionRetirementCandidates({
        markets,
        tradeMarketIds: ["with-trade"],
        resolverBondMarketIds: ["with-bond"],
        nowIso,
      })
    ).toBe(1);
  });
});
