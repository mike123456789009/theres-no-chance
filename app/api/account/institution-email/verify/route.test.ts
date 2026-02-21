import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  isSupabaseServerEnvConfigured: vi.fn(() => true),
  getMissingSupabaseServerEnv: vi.fn(() => []),
}));

vi.mock("@/lib/institutions/challenges", () => ({
  verifyInstitutionChallenge: vi.fn(),
}));

vi.mock("@/lib/institutions/memberships", () => ({
  getInstitutionAccessSnapshot: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { verifyInstitutionChallenge } from "@/lib/institutions/challenges";
import { getInstitutionAccessSnapshot } from "@/lib/institutions/memberships";

describe("POST /api/account/institution-email/verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "user-123",
              email: "person@example.com",
            },
          },
          error: null,
        }),
      },
    } as unknown as Awaited<ReturnType<typeof createClient>>);
  });

  it("returns 400 when code format is invalid", async () => {
    const request = new Request("http://localhost/api/account/institution-email/verify", {
      method: "POST",
      body: JSON.stringify({ challengeId: "challenge-123", code: "12ab" }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("6-digit");
  });

  it("returns 401 when session is unauthenticated", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: null,
          },
          error: null,
        }),
      },
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const request = new Request("http://localhost/api/account/institution-email/verify", {
      method: "POST",
      body: JSON.stringify({ challengeId: "challenge-123", code: "123456" }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe("Unauthorized.");
  });

  it("verifies challenge and returns updated institution snapshot", async () => {
    vi.mocked(verifyInstitutionChallenge).mockResolvedValue({
      organizationId: "11111111-1111-4111-8111-111111111111",
      organizationName: "Alpha University",
      organizationSlug: "alpha-university",
      verifiedEmail: "student@alpha.edu",
      verifiedAt: "2026-02-20T18:00:00.000Z",
    });

    vi.mocked(getInstitutionAccessSnapshot).mockResolvedValue({
      activeMembership: {
        organizationId: "11111111-1111-4111-8111-111111111111",
        organizationName: "Alpha University",
        organizationSlug: "alpha-university",
        verifiedAt: "2026-02-20T18:00:00.000Z",
      },
      verifiedInstitutionEmails: [
        {
          id: "institution-email-1",
          email: "student@alpha.edu",
          domain: "alpha.edu",
          organizationId: "11111111-1111-4111-8111-111111111111",
          organizationName: "Alpha University",
          organizationSlug: "alpha-university",
          verifiedAt: "2026-02-20T18:00:00.000Z",
        },
      ],
      pendingChallenge: null,
      canCreateInstitutionMarkets: true,
    });

    const request = new Request("http://localhost/api/account/institution-email/verify", {
      method: "POST",
      body: JSON.stringify({ challengeId: "challenge-123", code: "123456" }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(verifyInstitutionChallenge).toHaveBeenCalledTimes(1);
    expect(json.activeMembership.organizationName).toBe("Alpha University");
  });
});
