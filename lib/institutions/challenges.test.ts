import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  INSTITUTION_CHALLENGE_MAX_STARTS_PER_EMAIL_PER_HOUR,
  INSTITUTION_CHALLENGE_MAX_STARTS_PER_HOUR,
} from "@/lib/institutions/access";

const mocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  resolveOrganizationForDomain: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mocks.createServiceClient,
}));

vi.mock("@/lib/institutions/domain-resolution", () => ({
  resolveOrganizationForDomain: mocks.resolveOrganizationForDomain,
}));

import { startInstitutionEmailVerification } from "@/lib/institutions/challenges";

type StartFlowConfig = {
  byUserCount: number;
  byEmailCount: number;
  openChallenges?: Array<{
    id: string;
    expires_at: string;
    consumed_at: string | null;
    last_sent_at: string;
  }>;
};

function setupStartFlowClient(config: StartFlowConfig) {
  const identity = {
    id: "institution-email-1",
    user_id: "user-123",
    email: "student@alpha.edu",
    domain: "alpha.edu",
    organization_id: "11111111-1111-4111-8111-111111111111",
  };

  const userIdentitySelectQuery = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: identity, error: null }),
  };

  const userIdentityUpdateSingle = vi.fn().mockResolvedValue({
    data: {
      id: identity.id,
      email: identity.email,
      domain: identity.domain,
      organization_id: identity.organization_id,
    },
    error: null,
  });

  const userIdentityUpdateQuery = {
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnValue({
      single: userIdentityUpdateSingle,
    }),
  };

  const challengesSelect = vi.fn().mockImplementation((_: string, options?: { count?: string; head?: boolean }) => {
    if (options?.head) {
      const counts = challengesSelect.mock.calls.filter((call) => call[1]?.head).length;
      const countValue = counts === 1 ? config.byUserCount : config.byEmailCount;

      return {
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockResolvedValue({ count: countValue, error: null }),
      };
    }

    return {
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: config.openChallenges ?? [], error: null }),
    };
  });

  const consumeChallengeIs = vi.fn().mockResolvedValue({ data: null, error: null });
  const consumeChallengeEq = vi.fn().mockReturnValue({ is: consumeChallengeIs });
  const challengesUpdate = vi.fn().mockReturnValue({ eq: consumeChallengeEq });

  const challengeInsert = vi.fn().mockResolvedValue({ error: null });

  const userInstitutionEmailsTable = {
    select: vi.fn().mockReturnValue(userIdentitySelectQuery),
    update: vi.fn().mockReturnValue(userIdentityUpdateQuery),
    insert: vi.fn().mockImplementation(() => {
      throw new Error("Unexpected user_institution_emails.insert in start flow test");
    }),
  };

  const institutionEmailChallengesTable = {
    select: challengesSelect,
    update: challengesUpdate,
    insert: challengeInsert,
  };

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "user_institution_emails") {
      return userInstitutionEmailsTable;
    }

    if (table === "institution_email_challenges") {
      return institutionEmailChallengesTable;
    }

    throw new Error(`Unexpected table in challenges test: ${table}`);
  });

  mocks.createServiceClient.mockReturnValue({ from });

  return {
    challengesSelect,
    challengesUpdate,
    challengeInsert,
  };
}

describe("startInstitutionEmailVerification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-21T12:00:00.000Z"));

    mocks.resolveOrganizationForDomain.mockResolvedValue({
      kind: "resolved",
      organization: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Alpha University",
        slug: "alpha-university",
      },
      candidates: [],
      createdOrganization: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("consumes an older open challenge and creates a fresh challenge", async () => {
    const { challengesUpdate, challengeInsert } = setupStartFlowClient({
      byUserCount: 0,
      byEmailCount: 0,
      openChallenges: [
        {
          id: "challenge-old",
          expires_at: "2026-02-21T12:14:00.000Z",
          consumed_at: null,
          last_sent_at: "2026-02-21T11:58:30.000Z",
        },
      ],
    });

    const result = await startInstitutionEmailVerification({
      userId: "user-123",
      email: "student@alpha.edu",
      domain: "alpha.edu",
    });

    expect(result.kind).toBe("pending_challenge");
    if (result.kind === "pending_challenge") {
      expect(result.challengeId.length).toBeGreaterThan(0);
      expect(result.code).toMatch(/^\d{6}$/);
    }

    expect(challengesUpdate).toHaveBeenCalledTimes(1);
    expect(challengeInsert).toHaveBeenCalledTimes(1);
  });

  it("returns cooldown rate limit when an open challenge was sent too recently", async () => {
    const { challengesUpdate, challengeInsert } = setupStartFlowClient({
      byUserCount: 0,
      byEmailCount: 0,
      openChallenges: [
        {
          id: "challenge-recent",
          expires_at: "2026-02-21T12:14:30.000Z",
          consumed_at: null,
          last_sent_at: "2026-02-21T11:59:30.000Z",
        },
      ],
    });

    const result = await startInstitutionEmailVerification({
      userId: "user-123",
      email: "student@alpha.edu",
      domain: "alpha.edu",
    });

    expect(result.kind).toBe("rate_limited");
    if (result.kind === "rate_limited") {
      expect(result.message).toBe("Please wait before requesting another verification code.");
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
    }

    expect(challengesUpdate).not.toHaveBeenCalled();
    expect(challengeInsert).not.toHaveBeenCalled();
  });

  it("enforces per-user hourly start rate limits", async () => {
    const { challengesSelect, challengeInsert } = setupStartFlowClient({
      byUserCount: INSTITUTION_CHALLENGE_MAX_STARTS_PER_HOUR,
      byEmailCount: 0,
    });

    const result = await startInstitutionEmailVerification({
      userId: "user-123",
      email: "student@alpha.edu",
      domain: "alpha.edu",
    });

    expect(result).toEqual({
      kind: "rate_limited",
      message: "Too many institution verification requests from this account. Please try again shortly.",
      retryAfterSeconds: 60,
    });
    expect(challengesSelect).toHaveBeenCalledTimes(2);
    expect(challengeInsert).not.toHaveBeenCalled();
  });

  it("enforces per-email hourly start rate limits", async () => {
    const { challengeInsert } = setupStartFlowClient({
      byUserCount: 0,
      byEmailCount: INSTITUTION_CHALLENGE_MAX_STARTS_PER_EMAIL_PER_HOUR,
    });

    const result = await startInstitutionEmailVerification({
      userId: "user-123",
      email: "student@alpha.edu",
      domain: "alpha.edu",
    });

    expect(result).toEqual({
      kind: "rate_limited",
      message: "Too many institution verification requests for this email. Please try again shortly.",
      retryAfterSeconds: 60,
    });
    expect(challengeInsert).not.toHaveBeenCalled();
  });
});
