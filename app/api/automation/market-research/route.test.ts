import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/service", () => ({
  getMissingSupabaseServiceEnv: vi.fn((): string[] => []),
  isSupabaseServiceEnvConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/automation/market-research/runner", () => ({
  runInstitutionResearch: vi.fn(),
  runPublicResearch: vi.fn(),
}));

import type { ResearchRunSummary } from "@/lib/automation/market-research/types";
import { runInstitutionResearch, runPublicResearch } from "@/lib/automation/market-research/runner";
import { getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

import { GET as institutionCron } from "./institution/route";
import { GET as publicCron } from "./public/route";

const CRON_SECRET = "test-cron-secret";
const PUBLIC_URL = "http://localhost/api/automation/market-research/public";
const INSTITUTION_URL = "http://localhost/api/automation/market-research/institution";

function publicSummary(overrides: Partial<ResearchRunSummary> = {}): ResearchRunSummary {
  return {
    scope: "public",
    runId: "public-run-1",
    status: "completed",
    modelName: "gpt-default",
    scoutModelName: "gpt-scout-default",
    startedAt: "2026-06-21T00:00:00.000Z",
    completedAt: "2026-06-21T00:01:00.000Z",
    generated: 4,
    submitted: 2,
    skippedDuplicate: 1,
    skippedQuality: 1,
    skippedInvalid: 0,
    submitFailed: 0,
    topSubmittedQuestions: ["Will public transit add late service?"],
    ...overrides,
  };
}

function institutionSummary(overrides: Partial<ResearchRunSummary> = {}): ResearchRunSummary {
  return {
    scope: "institution",
    runId: "institution-run-1",
    status: "partial",
    modelName: "gpt-default",
    scoutModelName: "gpt-scout-default",
    startedAt: "2026-06-21T00:00:00.000Z",
    completedAt: "2026-06-21T00:01:00.000Z",
    generated: 5,
    submitted: 3,
    skippedDuplicate: 0,
    skippedQuality: 1,
    skippedInvalid: 0,
    submitFailed: 1,
    topSubmittedQuestions: ["Will CMC add weekend dining hours?"],
    failuresByInstitution: [
      {
        organizationId: "22222222-2222-4222-8222-222222222222",
        organizationName: "Alpha College",
        error: "OpenAI timeout",
      },
    ],
    ...overrides,
  };
}

function authorizedRequest(url: string) {
  return new Request(url, {
    headers: {
      authorization: `Bearer ${CRON_SECRET}`,
    },
  });
}

describe("market research cron routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
    vi.stubEnv("MARKET_RESEARCH_MODEL", "");
    vi.stubEnv("MARKET_RESEARCH_SCOUT_MODEL", "");
    vi.stubEnv("MARKET_RESEARCH_PUBLIC_MAX_PER_CRON", "");
    vi.stubEnv("MARKET_RESEARCH_INSTITUTION_MAX_PER_CRON", "");
    vi.mocked(isSupabaseServiceEnvConfigured).mockReturnValue(true);
    vi.mocked(getMissingSupabaseServiceEnv).mockReturnValue([]);
    vi.mocked(runPublicResearch).mockResolvedValue(publicSummary());
    vi.mocked(runInstitutionResearch).mockResolvedValue(institutionSummary());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects missing or incorrect cron authorization before service env checks", async () => {
    const missingResponse = await publicCron(new Request(PUBLIC_URL));
    const missingJson = await missingResponse.json();

    expect(missingResponse.status).toBe(401);
    expect(missingJson.error).toBe("Unauthorized cron request.");

    const wrongResponse = await institutionCron(
      new Request(INSTITUTION_URL, {
        headers: {
          authorization: "Bearer wrong-secret",
        },
      })
    );
    const wrongJson = await wrongResponse.json();

    expect(wrongResponse.status).toBe(401);
    expect(wrongJson.error).toBe("Unauthorized cron request.");
    expect(isSupabaseServiceEnvConfigured).not.toHaveBeenCalled();
    expect(runPublicResearch).not.toHaveBeenCalled();
    expect(runInstitutionResearch).not.toHaveBeenCalled();
  });

  it("returns 503 when cron service-role configuration is unavailable", async () => {
    vi.mocked(isSupabaseServiceEnvConfigured).mockReturnValue(false);
    vi.mocked(getMissingSupabaseServiceEnv).mockReturnValue(["SUPABASE_SERVICE_ROLE_KEY"]);

    const response = await publicCron(authorizedRequest(PUBLIC_URL));
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json).toEqual({
      error: "Market research automation unavailable: missing Supabase service role configuration.",
      missingEnv: ["SUPABASE_SERVICE_ROLE_KEY"],
    });
    expect(runPublicResearch).not.toHaveBeenCalled();
    expect(runInstitutionResearch).not.toHaveBeenCalled();
  });

  it("runs public research with submit enabled, parsed cron max, model env, and route timeout", async () => {
    vi.stubEnv("MARKET_RESEARCH_MODEL", "  gpt-custom  ");
    vi.stubEnv("MARKET_RESEARCH_SCOUT_MODEL", "  gpt-scout  ");
    vi.stubEnv("MARKET_RESEARCH_PUBLIC_MAX_PER_CRON", "7");

    const response = await publicCron(authorizedRequest(PUBLIC_URL));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.summary).toEqual(publicSummary());
    expect(runPublicResearch).toHaveBeenCalledWith({
      submit: true,
      maxToSubmit: 7,
      modelName: "gpt-custom",
      scoutModelName: "gpt-scout",
      runTimeoutMs: 710000,
    });
    expect(runInstitutionResearch).not.toHaveBeenCalled();
  });

  it("runs institution research with submit enabled and parsed max per organization", async () => {
    vi.stubEnv("MARKET_RESEARCH_INSTITUTION_MAX_PER_CRON", "4");

    const response = await institutionCron(authorizedRequest(INSTITUTION_URL));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.summary).toEqual(institutionSummary());
    expect(runInstitutionResearch).toHaveBeenCalledWith({
      submit: true,
      maxPerOrganization: 4,
      modelName: expect.any(String),
      scoutModelName: expect.any(String),
      runTimeoutMs: 710000,
    });
    expect(runPublicResearch).not.toHaveBeenCalled();
  });

  it("falls back to route defaults for invalid cron max values", async () => {
    vi.stubEnv("MARKET_RESEARCH_PUBLIC_MAX_PER_CRON", "not-a-number");
    vi.stubEnv("MARKET_RESEARCH_INSTITUTION_MAX_PER_CRON", "0");

    const publicResponse = await publicCron(authorizedRequest(PUBLIC_URL));
    const institutionResponse = await institutionCron(authorizedRequest(INSTITUTION_URL));

    expect(publicResponse.status).toBe(200);
    expect(institutionResponse.status).toBe(200);
    expect(runPublicResearch).toHaveBeenCalledWith(
      expect.objectContaining({
        maxToSubmit: 20,
      })
    );
    expect(runInstitutionResearch).toHaveBeenCalledWith(
      expect.objectContaining({
        maxPerOrganization: 10,
      })
    );
  });

  it("maps runner failures to the route-specific 500 response", async () => {
    vi.mocked(runPublicResearch).mockRejectedValueOnce(new Error("public runner failed"));
    vi.mocked(runInstitutionResearch).mockRejectedValueOnce(new Error("institution runner failed"));

    const publicResponse = await publicCron(authorizedRequest(PUBLIC_URL));
    const publicJson = await publicResponse.json();
    const institutionResponse = await institutionCron(authorizedRequest(INSTITUTION_URL));
    const institutionJson = await institutionResponse.json();

    expect(publicResponse.status).toBe(500);
    expect(publicJson).toEqual({
      error: "Public market research cron run failed.",
      detail: "public runner failed",
    });
    expect(institutionResponse.status).toBe(500);
    expect(institutionJson).toEqual({
      error: "Institution market research cron run failed.",
      detail: "institution runner failed",
    });
  });
});
