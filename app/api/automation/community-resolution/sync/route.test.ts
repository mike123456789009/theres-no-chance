import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(),
  getMissingSupabaseServiceEnv: vi.fn(() => []),
  isSupabaseServiceEnvConfigured: vi.fn(() => true),
}));

import { createServiceClient, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

import { GET } from "./route";

describe("Routes: /api/automation/community-resolution/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    vi.mocked(isSupabaseServiceEnvConfigured).mockReturnValue(true);
  });

  it("rejects requests without the cron secret", async () => {
    const response = await GET(new Request("http://localhost/api/automation/community-resolution/sync"));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe("Unauthorized cron request.");
  });

  it("runs close sync, no-action retirement, resolution, and finalization in order", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: 2, error: null })
      .mockResolvedValueOnce({ data: 3, error: null })
      .mockResolvedValueOnce({ data: 4, error: null })
      .mockResolvedValueOnce({ data: 5, error: null });
    vi.mocked(createServiceClient).mockReturnValue({ rpc } as unknown as ReturnType<typeof createServiceClient>);

    const response = await GET(
      new Request("http://localhost/api/automation/community-resolution/sync", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(rpc.mock.calls.map((call) => call[0])).toEqual([
      "sync_market_close_state",
      "retire_no_action_closed_markets",
      "sync_due_community_resolutions",
      "sync_due_community_finalizations",
    ]);
    expect(json.summary).toEqual({
      closedMarketsUpdated: 2,
      noActionMarketsRetired: 3,
      resolutionStatesProcessed: 4,
      autoFinalizedMarkets: 5,
    });
  });
});
