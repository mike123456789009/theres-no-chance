// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminResolutionQueue } from "./admin-resolution-queue";

const routerRefreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: routerRefreshMock,
  }),
}));

function createResponse(ok: boolean, payload: unknown): Response {
  return {
    ok,
    json: async () => payload,
  } as Response;
}

type ResolutionQueueProps = Parameters<typeof AdminResolutionQueue>[0];
type ResolutionMarket = ResolutionQueueProps["autoFinalizable"][number];

function createMarket(overrides: Partial<ResolutionMarket> = {}): ResolutionMarket {
  return {
    id: "market-auto",
    question: "Will the library stay open overnight?",
    status: "pending_finalization",
    resolutionMode: "community",
    closeTime: "2026-06-01T00:00:00.000Z",
    resolvedAt: "2026-06-02T00:00:00.000Z",
    finalizedAt: null,
    resolutionOutcome: null,
    provisionalOutcome: "yes",
    resolutionWindowEndsAt: "2026-06-03T00:00:00.000Z",
    challengeWindowEndsAt: "2026-06-04T00:00:00.000Z",
    adjudicationRequired: false,
    adjudicationReason: null,
    yesBondTotal: 25,
    noBondTotal: 10,
    challengeCount: 0,
    openChallengeCount: 0,
    creatorId: "creator-market",
    tags: ["campus"],
    totalEvidenceCount: 0,
    recentEvidence: [],
    challengeContext: [],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

beforeEach(() => {
  routerRefreshMock.mockReset();
});

describe("AdminResolutionQueue", () => {
  it("finalizes an auto-finalizable market with a null outcome", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => createResponse(true, { message: "Market finalized." }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AdminResolutionQueue
        autoFinalizable={[createMarket()]}
        adjudicationRequired={[]}
        finalizedMarkets={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Finalize now" }));

    await screen.findByText("Market finalized.");
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/markets/market-auto/finalize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ outcome: null }),
    });
    expect(routerRefreshMock).toHaveBeenCalledTimes(1);
  });

  it("renders adjudication context and finalizes the selected outcome", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => createResponse(true, { message: "Outcome selected." }));
    vi.stubGlobal("fetch", fetchMock);
    const adjudicationMarket = createMarket({
      id: "market-adjudicate",
      question: "Will the protest permit be approved?",
      adjudicationRequired: true,
      adjudicationReason: "challenge_tie",
      provisionalOutcome: "no",
      challengeCount: 2,
      openChallengeCount: 1,
      totalEvidenceCount: 1,
      recentEvidence: [
        {
          id: "evidence-1",
          submittedBy: "submitter-abcdef123456",
          submittedOutcome: "yes",
          evidenceUrl: "https://example.com/source",
          evidenceText: "The public hearing notes support YES.",
          notes: "primary source",
          createdAt: "2026-06-05T00:00:00.000Z",
        },
      ],
      challengeContext: [
        {
          id: "challenge-1",
          createdBy: "challenger-abcdef123456",
          status: "under_review",
          proposedOutcome: "yes",
          challengeBondAmount: 8,
          reason: "The cited source was updated after resolution.",
          createdAt: "2026-06-06T00:00:00.000Z",
          expiresAt: "2026-06-07T00:00:00.000Z",
          resolverBondOutcome: "no",
          resolverBondAmount: 12,
          resolverBondUserId: "resolver-abcdef123456",
        },
      ],
    });

    render(
      <AdminResolutionQueue
        autoFinalizable={[]}
        adjudicationRequired={[adjudicationMarket]}
        finalizedMarkets={[createMarket({
          id: "market-finalized",
          question: "Finalized market",
          finalizedAt: "2026-06-10T00:00:00.000Z",
          resolutionOutcome: "yes",
        })]}
      />,
    );

    const adjudicationSection = screen.getByRole("region", { name: "Adjudication-required markets" });
    expect(within(adjudicationSection).getByText("Will the protest permit be approved?")).toBeInTheDocument();
    expect(screen.getByText("The public hearing notes support YES.")).toBeInTheDocument();
    expect(screen.getByText("Reason: The cited source was updated after resolution.")).toBeInTheDocument();
    expect(within(adjudicationSection).getByRole("link", { name: "Open market detail" })).toHaveAttribute("href", "/markets/market-adjudicate");

    await user.click(screen.getByRole("button", { name: "Finalize NO" }));

    await screen.findByText("Outcome selected.");
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/markets/market-adjudicate/finalize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ outcome: "no" }),
    });
    await waitFor(() => expect(routerRefreshMock).toHaveBeenCalledTimes(1));

    const finalizedSection = screen.getByRole("region", { name: "Finalized markets" });
    expect(within(finalizedSection).getByText("Finalized market")).toBeInTheDocument();
    expect(within(finalizedSection).getByText("Outcome: Yes")).toBeInTheDocument();
  });

  it("shows API finalization errors without refreshing", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => createResponse(false, { detail: "Challenge window still open." }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AdminResolutionQueue
        autoFinalizable={[createMarket()]}
        adjudicationRequired={[]}
        finalizedMarkets={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Finalize now" }));

    await screen.findByText("Challenge window still open.");
    expect(routerRefreshMock).not.toHaveBeenCalled();
  });
});
