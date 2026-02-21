import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mocks.createServiceClient,
}));

import { loadAdminQueueMarkets, loadProposedMarketPreviews } from "./review-queue";

describe("admin review queue loaders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps and partitions review/open queue markets", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [
          {
            id: "m1",
            question: "Review market",
            status: "review",
            close_time: "2026-06-01T00:00:00.000Z",
            created_at: "2026-01-01T00:00:00.000Z",
            creator_id: "u1",
            tags: ["college"],
          },
          {
            id: "m2",
            question: "Open market",
            status: "open",
            close_time: "2026-06-02T00:00:00.000Z",
            created_at: "2026-01-02T00:00:00.000Z",
            creator_id: "u2",
            tags: null,
          },
        ],
        error: null,
      }),
    };

    mocks.createServiceClient.mockReturnValue({
      from: vi.fn().mockReturnValue(query),
    });

    const result = await loadAdminQueueMarkets();

    expect(result.errorMessage).toBe("");
    expect(result.reviewMarkets).toHaveLength(1);
    expect(result.openMarkets).toHaveLength(1);
    expect(result.reviewMarkets[0]).toMatchObject({
      id: "m1",
      status: "review",
      tags: ["college"],
    });
    expect(result.openMarkets[0]).toMatchObject({
      id: "m2",
      status: "open",
      tags: [],
    });
  });

  it("maps proposal previews with AMM normalization and sources", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [
          {
            id: "pm1",
            question: "Proposed market",
            description: "desc",
            resolves_yes_if: "yes rule",
            resolves_no_if: "no rule",
            status: "review",
            visibility: "public",
            access_rules: null,
            close_time: "2026-06-10T00:00:00.000Z",
            created_at: "2026-01-10T00:00:00.000Z",
            fee_bps: 200,
            creator_id: "u3",
            tags: ["policy"],
            market_amm_state: {
              last_price_yes: "1.25",
              last_price_no: "-0.2",
              yes_shares: "10.5",
              no_shares: "4.5",
            },
            market_sources: [
              {
                source_label: "Official",
                source_url: "https://example.com",
                source_type: "official",
              },
            ],
          },
        ],
        error: null,
      }),
    };

    mocks.createServiceClient.mockReturnValue({
      from: vi.fn().mockReturnValue(query),
    });

    const result = await loadProposedMarketPreviews(10);

    expect(result.errorMessage).toBe("");
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]).toMatchObject({
      id: "pm1",
      priceYes: 1,
      priceNo: 0,
      yesShares: 10.5,
      noShares: 4.5,
      poolShares: 15,
      sources: [
        {
          label: "Official",
          url: "https://example.com",
          type: "official",
        },
      ],
    });
    expect(result.proposals[0].accessBadge.length).toBeGreaterThan(0);
  });
});
