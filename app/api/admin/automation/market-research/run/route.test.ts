import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/admin-guard", () => ({
  requireAllowlistedAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  getMissingSupabaseServiceEnv: vi.fn((): string[] => []),
  isSupabaseServiceEnvConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/automation/market-research/runner", () => ({
  runInstitutionResearch: vi.fn(),
  runPublicResearch: vi.fn(),
}));

import { runInstitutionResearch, runPublicResearch } from "@/lib/automation/market-research/runner";
import { requireAllowlistedAdmin } from "@/lib/auth/admin-guard";
import { getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";
import { createRouteRequest } from "@/lib/test-helpers/api-mocks";

import { POST } from "./route";

const RUN_URL = "http://localhost/api/admin/automation/market-research/run";
const ADMIN_USER = {
  id: "admin-user-1",
  email: "admin@example.edu",
};

function createRunRequest(body: unknown) {
  return createRouteRequest(RUN_URL, { body });
}

describe("POST /api/admin/automation/market-research/run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("MARKET_RESEARCH_MODEL", "");
    vi.stubEnv("MARKET_RESEARCH_SCOUT_MODEL", "");
    vi.mocked(requireAllowlistedAdmin).mockResolvedValue({
      ok: true,
      adminUser: ADMIN_USER,
    });
    vi.mocked(isSupabaseServiceEnvConfigured).mockReturnValue(true);
    vi.mocked(getMissingSupabaseServiceEnv).mockReturnValue([]);
    vi.mocked(runPublicResearch).mockResolvedValue({
      scope: "public",
      runId: "public-run-1",
      status: "completed",
      modelName: "gpt-default",
      startedAt: "2026-06-21T00:00:00.000Z",
      completedAt: "2026-06-21T00:01:00.000Z",
      generated: 2,
      submitted: 1,
      skippedDuplicate: 0,
      skippedQuality: 1,
      skippedInvalid: 0,
      submitFailed: 0,
      topSubmittedQuestions: ["Will the library stay open late?"],
    });
    vi.mocked(runInstitutionResearch).mockResolvedValue({
      scope: "institution",
      runId: "institution-run-1",
      status: "partial",
      modelName: "gpt-default",
      startedAt: "2026-06-21T00:00:00.000Z",
      completedAt: "2026-06-21T00:01:00.000Z",
      generated: 4,
      submitted: 2,
      skippedDuplicate: 1,
      skippedQuality: 0,
      skippedInvalid: 0,
      submitFailed: 1,
      topSubmittedQuestions: ["Will CMC add another dining option?"],
      failuresByInstitution: [],
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the admin guard response before checking service configuration or parsing the body", async () => {
    vi.mocked(requireAllowlistedAdmin).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    });

    const response = await POST(createRunRequest({ scope: "public" }));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe("Forbidden.");
    expect(isSupabaseServiceEnvConfigured).not.toHaveBeenCalled();
    expect(runPublicResearch).not.toHaveBeenCalled();
    expect(runInstitutionResearch).not.toHaveBeenCalled();
  });

  it("returns 503 when service-role configuration is unavailable", async () => {
    vi.mocked(isSupabaseServiceEnvConfigured).mockReturnValue(false);
    vi.mocked(getMissingSupabaseServiceEnv).mockReturnValue(["SUPABASE_SERVICE_ROLE_KEY"]);

    const response = await POST(createRunRequest({ scope: "public" }));
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json).toEqual({
      error: "Market research automation unavailable: missing Supabase service role configuration.",
      missingEnv: ["SUPABASE_SERVICE_ROLE_KEY"],
    });
    expect(runPublicResearch).not.toHaveBeenCalled();
    expect(runInstitutionResearch).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and invalid scopes before invoking scans", async () => {
    const malformedResponse = await POST(
      new Request(RUN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "{bad json",
      })
    );
    const malformedJson = await malformedResponse.json();

    expect(malformedResponse.status).toBe(400);
    expect(malformedJson.error).toBe("Request body must be valid JSON.");

    const invalidScopeResponse = await POST(createRunRequest({ scope: "campus" }));
    const invalidScopeJson = await invalidScopeResponse.json();

    expect(invalidScopeResponse.status).toBe(400);
    expect(invalidScopeJson.error).toBe("scope must be one of: public, institution.");
    expect(runPublicResearch).not.toHaveBeenCalled();
    expect(runInstitutionResearch).not.toHaveBeenCalled();
  });

  it("runs public research with normalized scope, parsed options, model env, and timeout", async () => {
    vi.stubEnv("MARKET_RESEARCH_MODEL", "  gpt-custom  ");
    vi.stubEnv("MARKET_RESEARCH_SCOUT_MODEL", "  gpt-scout  ");

    const response = await POST(
      createRunRequest({
        scope: " PUBLIC ",
        submit: "false",
        maxToSubmit: "5",
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.message).toBe("Public proposal run completed.");
    expect(json.summary).toMatchObject({
      runId: "public-run-1",
      status: "completed",
      submitted: 1,
    });
    expect(runPublicResearch).toHaveBeenCalledWith({
      submit: false,
      maxToSubmit: 5,
      modelName: "gpt-custom",
      scoutModelName: "gpt-scout",
      runTimeoutMs: 710000,
    });
    expect(runInstitutionResearch).not.toHaveBeenCalled();
  });

  it("runs institution research with default submit and count fallback", async () => {
    const response = await POST(
      createRunRequest({
        scope: "institution",
        submit: "yes",
        maxPerOrganization: "0",
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.message).toBe("Institution proposal run completed.");
    expect(json.summary).toMatchObject({
      runId: "institution-run-1",
      status: "partial",
      submitted: 2,
    });
    expect(runInstitutionResearch).toHaveBeenCalledWith({
      submit: true,
      maxPerOrganization: 3,
      modelName: expect.any(String),
      scoutModelName: expect.any(String),
      runTimeoutMs: 710000,
    });
    expect(runPublicResearch).not.toHaveBeenCalled();
  });

  it("uses public max fallback for invalid values and defaults submit to true", async () => {
    const response = await POST(
      createRunRequest({
        scope: "public",
        submit: "maybe",
        maxToSubmit: "not-a-number",
      })
    );

    expect(response.status).toBe(200);
    expect(runPublicResearch).toHaveBeenCalledWith(
      expect.objectContaining({
        submit: true,
        maxToSubmit: 8,
        runTimeoutMs: 710000,
      })
    );
  });

  it("returns 500 with runner error details", async () => {
    vi.mocked(runPublicResearch).mockRejectedValue(new Error("public lock failed"));

    const response = await POST(createRunRequest({ scope: "public" }));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toEqual({
      error: "Unable to invoke market research run.",
      detail: "public lock failed",
    });
  });
});
