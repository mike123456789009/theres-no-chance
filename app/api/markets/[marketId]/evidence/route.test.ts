import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  isSupabaseServerEnvConfigured: vi.fn(() => true),
  getMissingSupabaseServerEnv: vi.fn(() => []),
}));

import { createClient } from "@/lib/supabase/server";

const context = {
  params: Promise.resolve({ marketId: "market-123" }),
};

function buildSupabaseMock() {
  const authGetUser = vi.fn();
  const marketMaybeSingle = vi.fn();
  const marketEq = vi.fn(() => ({ maybeSingle: marketMaybeSingle }));
  const marketSelect = vi.fn(() => ({ eq: marketEq }));

  const evidenceSingle = vi.fn();
  const evidenceSelect = vi.fn(() => ({ single: evidenceSingle }));
  const evidenceInsert = vi.fn(() => ({ select: evidenceSelect }));

  const from = vi.fn((table: string) => {
    if (table === "markets") {
      return { select: marketSelect };
    }
    if (table === "market_evidence") {
      return { insert: evidenceInsert };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    client: {
      auth: {
        getUser: authGetUser,
      },
      from,
    },
    authGetUser,
    marketMaybeSingle,
    evidenceInsert,
    evidenceSingle,
  };
}

describe("POST /api/markets/[marketId]/evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts text-only evidence when market is closed", async () => {
    const supabaseMock = buildSupabaseMock();
    supabaseMock.authGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
    supabaseMock.marketMaybeSingle.mockResolvedValue({
      data: { id: "market-123", status: "closed", finalized_at: null },
      error: null,
    });
    supabaseMock.evidenceSingle.mockResolvedValue({
      data: {
        id: "evidence-1",
        market_id: "market-123",
        submitted_by: "user-123",
        evidence_url: null,
        evidence_text: "Official score posted by the event organizer.",
        notes: "Posted at 10:31pm local.",
        submitted_outcome: "yes",
        created_at: "2026-02-21T00:00:00.000Z",
      },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue(supabaseMock.client as any);

    const request = new Request("http://localhost/api/markets/market-123/evidence", {
      method: "POST",
      body: JSON.stringify({
        evidenceText: "Official score posted by the event organizer.",
        notes: "Posted at 10:31pm local.",
        submittedOutcome: "yes",
      }),
    });

    const response = await POST(request, context);
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(supabaseMock.evidenceInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        market_id: "market-123",
        submitted_by: "user-123",
        evidence_url: null,
        evidence_text: "Official score posted by the event organizer.",
      })
    );
    expect(json.evidence.id).toBe("evidence-1");
  });

  it("rejects submission when both URL and text are missing", async () => {
    const request = new Request("http://localhost/api/markets/market-123/evidence", {
      method: "POST",
      body: JSON.stringify({
        notes: "just notes",
      }),
    });

    const response = await POST(request, context);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect((json.details as string[])[0]).toContain("Provide at least one");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rejects non-https evidence URLs", async () => {
    const request = new Request("http://localhost/api/markets/market-123/evidence", {
      method: "POST",
      body: JSON.stringify({
        evidenceUrl: "http://example.com/source",
      }),
    });

    const response = await POST(request, context);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect((json.details as string[])[0]).toContain("valid https URL");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    const supabaseMock = buildSupabaseMock();
    supabaseMock.authGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue(supabaseMock.client as any);

    const request = new Request("http://localhost/api/markets/market-123/evidence", {
      method: "POST",
      body: JSON.stringify({
        evidenceText: "Photo from venue entry line.",
      }),
    });

    const response = await POST(request, context);
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe("Unauthorized.");
  });

  it("blocks submissions outside the closed/pending/resolved resolution window", async () => {
    const supabaseMock = buildSupabaseMock();
    supabaseMock.authGetUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });
    supabaseMock.marketMaybeSingle.mockResolvedValue({
      data: { id: "market-123", status: "open", finalized_at: null },
      error: null,
    });
    vi.mocked(createClient).mockResolvedValue(supabaseMock.client as any);

    const request = new Request("http://localhost/api/markets/market-123/evidence", {
      method: "POST",
      body: JSON.stringify({
        evidenceText: "Crowd estimate posted by venue staff.",
      }),
    });

    const response = await POST(request, context);
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toContain("only accepted while community resolution is active");
  });
});
