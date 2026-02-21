import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  isSupabaseServerEnvConfigured: vi.fn(() => true),
  getMissingSupabaseServerEnv: vi.fn(() => []),
}));

vi.mock("@/lib/institutions/challenges", () => ({
  startInstitutionEmailVerification: vi.fn(),
}));

vi.mock("@/lib/institutions/email", () => ({
  sendInstitutionVerificationEmail: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { sendInstitutionVerificationEmail } from "@/lib/institutions/email";
import { startInstitutionEmailVerification } from "@/lib/institutions/challenges";

describe("POST /api/account/institution-email/start", () => {
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

  it("returns 400 for non-edu emails", async () => {
    const request = new Request("http://localhost/api/account/institution-email/start", {
      method: "POST",
      body: JSON.stringify({ email: "person@gmail.com" }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain(".edu");
  });

  it("returns ambiguous response with candidate options", async () => {
    vi.mocked(startInstitutionEmailVerification).mockResolvedValue({
      kind: "ambiguous",
      candidates: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Alpha University",
          slug: "alpha-university",
          domain: "alpha.edu",
          allowSubdomains: true,
          matchType: "exact",
          specificity: 9,
        },
      ],
    });

    const request = new Request("http://localhost/api/account/institution-email/start", {
      method: "POST",
      body: JSON.stringify({ email: "student@alpha.edu" }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.code).toBe("AMBIGUOUS_INSTITUTION");
    expect(Array.isArray(json.candidates)).toBe(true);
  });

  it("returns no-match response when no institution is found", async () => {
    vi.mocked(startInstitutionEmailVerification).mockResolvedValue({
      kind: "no_match",
      candidates: [],
    });

    const request = new Request("http://localhost/api/account/institution-email/start", {
      method: "POST",
      body: JSON.stringify({ email: "student@unknown.edu" }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.code).toBe("NO_INSTITUTION_MATCH");
  });

  it("sends verification email for a resolvable institution", async () => {
    vi.mocked(startInstitutionEmailVerification).mockResolvedValue({
      kind: "pending_challenge",
      challengeId: "challenge-123",
      institutionEmailId: "institution-email-123",
      email: "student@alpha.edu",
      domain: "alpha.edu",
      organization: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Alpha University",
        slug: "alpha-university",
      },
      expiresAt: "2026-02-20T18:00:00.000Z",
      resendAvailableAt: "2026-02-20T17:46:00.000Z",
      code: "123456",
      createdOrganization: false,
    });

    vi.mocked(sendInstitutionVerificationEmail).mockResolvedValue({ id: "email-123" });

    const request = new Request("http://localhost/api/account/institution-email/start", {
      method: "POST",
      body: JSON.stringify({ email: "student@alpha.edu" }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(sendInstitutionVerificationEmail).toHaveBeenCalledTimes(1);
    expect(json.pendingChallenge.challengeId).toBe("challenge-123");
  });
});
