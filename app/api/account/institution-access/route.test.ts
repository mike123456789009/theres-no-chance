import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

vi.mock("@/lib/api/env-guards", () => ({
  getServerEnvReadiness: vi.fn(() => ({ isConfigured: true, missingEnv: [] })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/institutions/service", () => ({
  getInstitutionAccessSnapshot: vi.fn(),
}));

import { getServerEnvReadiness } from "@/lib/api/env-guards";
import { createClient } from "@/lib/supabase/server";
import { getInstitutionAccessSnapshot } from "@/lib/institutions/service";

describe("GET /api/account/institution-access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerEnvReadiness).mockReturnValue({ isConfigured: true, missingEnv: [] });
  });

  it("returns 503 with missingEnv when server env is not configured", async () => {
    vi.mocked(getServerEnvReadiness).mockReturnValue({
      isConfigured: false,
      missingEnv: ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
    });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error).toBe("Institution access is unavailable: missing Supabase environment variables.");
    expect(Array.isArray(json.missingEnv)).toBe(true);
    expect(json.missingEnv[0]).toBe("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  });

  it("returns 401 for unauthenticated users", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe("Unauthorized.");
  });

  it("returns expected access snapshot payload keys", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-123" } },
          error: null,
        }),
      },
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    vi.mocked(getInstitutionAccessSnapshot).mockResolvedValue({
      activeMembership: {
        organizationId: "org-123",
        organizationName: "Alpha University",
        organizationSlug: "alpha-university",
        verifiedAt: "2026-02-20T00:00:00.000Z",
      },
      verifiedInstitutionEmails: [],
      pendingChallenge: null,
      canCreateInstitutionMarkets: true,
    });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.activeMembership).toBeDefined();
    expect(Array.isArray(json.verifiedInstitutionEmails)).toBe(true);
    expect(json.canCreateInstitutionMarkets).toBe(true);
  });
});
