import { describe, expect, it } from "vitest";

import {
  buildMarketDetailChartPoints,
  mapEvidenceRows,
  mapResolverPrizeContributionRows,
} from "./detail";

describe("read-markets detail helpers", () => {
  it("builds deterministic chart point count and carries price", () => {
    const points = buildMarketDetailChartPoints({
      createdAt: "2026-01-01T00:00:00.000Z",
      closeTime: "2026-02-01T00:00:00.000Z",
      expectedResolutionTime: null,
      priceYes: 0.42,
    });

    expect(points).toHaveLength(9);
    expect(points[0]?.priceYes).toBe(0.42);
    expect(points[8]?.priceYes).toBe(0.42);
    expect(Date.parse(points[8]!.timestamp)).toBeGreaterThanOrEqual(Date.parse(points[0]!.timestamp));
  });

  it("maps evidence rows with cleaned nullable text fields", () => {
    const mapped = mapEvidenceRows([
      {
        id: "ev-1",
        submitted_by: "user-1",
        evidence_url: "  https://example.com/evidence  ",
        evidence_text: "  ",
        notes: null,
        submitted_outcome: "yes",
        created_at: "2026-02-21T00:00:00.000Z",
      },
    ]);

    expect(mapped).toEqual([
      {
        id: "ev-1",
        submittedBy: "user-1",
        evidenceUrl: "https://example.com/evidence",
        evidenceText: null,
        notes: null,
        submittedOutcome: "yes",
        createdAt: "2026-02-21T00:00:00.000Z",
      },
    ]);
  });

  it("maps resolver contribution rows with non-negative numeric amounts", () => {
    const mapped = mapResolverPrizeContributionRows([
      {
        id: "c1",
        contributor_id: "u1",
        amount: "2.5",
        status: "locked",
        created_at: "2026-02-21T00:00:00.000Z",
      },
      {
        id: "c2",
        contributor_id: "u2",
        amount: "-4",
        status: "released",
        created_at: "2026-02-21T01:00:00.000Z",
      },
    ]);

    expect(mapped[0]?.amount).toBe(2.5);
    expect(mapped[1]?.amount).toBe(0);
  });
});
