// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CommunityResolvePanel } from "./community-resolve-panel";

type CommunityResolveProps = Parameters<typeof CommunityResolvePanel>[0];

function createProps(overrides: Partial<CommunityResolveProps> = {}): CommunityResolveProps {
  return {
    marketId: "market-1",
    status: "pending_resolution",
    resolutionWindowEndsAt: "2026-06-22T18:00:00.000Z",
    challengeWindowEndsAt: "2026-06-23T18:00:00.000Z",
    provisionalOutcome: "yes",
    resolutionOutcome: null,
    adjudicationRequired: false,
    adjudicationReason: null,
    yesBondTotal: 12,
    noBondTotal: 8,
    resolverStakeCap: 25,
    challengeCount: 1,
    openChallengeCount: 0,
    viewerIsAuthenticated: true,
    viewerCanResolve: false,
    viewerCanChallenge: false,
    viewerResolverBond: null,
    viewerChallenge: null,
    ...overrides,
  };
}

function mockJsonResponse(ok: boolean, payload: unknown): Response {
  return {
    ok,
    json: async () => payload,
  } as Response;
}

function mockLocationReload() {
  const reload = vi.fn();
  const original = window.location;

  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      ...original,
      reload,
    },
  });

  return {
    reload,
    restore: () => {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: original,
      });
    },
  };
}

describe("CommunityResolvePanel", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows summary state and login links for guests", () => {
    render(<CommunityResolvePanel {...createProps({ viewerIsAuthenticated: false })} />);

    expect(screen.getByRole("heading", { name: "Community resolve" })).toBeInTheDocument();
    expect(screen.getByText(/YES stake \$12.00/)).toHaveTextContent("YES stake $12.00");
    expect(screen.getByText(/YES stake \$12.00/)).toHaveTextContent("NO stake $8.00");
    expect(screen.getByText(/Challenges:/)).toHaveTextContent("Challenges: 1 total, 0 open");
    expect(screen.getByRole("link", { name: "Log in to resolve" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/signup");
  });

  it("validates resolver vote stake before calling the API", async () => {
    const user = userEvent.setup();
    render(<CommunityResolvePanel {...createProps({ viewerCanResolve: true })} />);

    const stakeInput = screen.getByLabelText("Stake (USD)");
    await user.clear(stakeInput);
    await user.type(stakeInput, "30");
    await user.click(screen.getByRole("button", { name: "Submit vote" }));

    expect(screen.getByText("Resolver stake must be between $1.00 and $25.00.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits resolver votes and reloads on success", async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse(true, {}));
    const locationMock = mockLocationReload();
    const user = userEvent.setup();

    try {
      render(<CommunityResolvePanel {...createProps({ viewerCanResolve: true })} />);

      await user.selectOptions(screen.getByLabelText("Outcome"), "no");
      const stakeInput = screen.getByLabelText("Stake (USD)");
      await user.clear(stakeInput);
      await user.type(stakeInput, "5");
      await user.click(screen.getByRole("button", { name: "Submit vote" }));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/markets/market-1/resolve/bond",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ outcome: "no", bondAmount: 5 }),
          })
        );
      });
      expect(screen.getByText("Resolver vote submitted.")).toBeInTheDocument();
      expect(locationMock.reload).toHaveBeenCalled();
    } finally {
      locationMock.restore();
    }
  });

  it("surfaces resolver vote API errors without reloading", async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse(false, { detail: "Resolution window is closed." }));
    const locationMock = mockLocationReload();
    const user = userEvent.setup();

    try {
      render(<CommunityResolvePanel {...createProps({ viewerCanResolve: true })} />);

      await user.click(screen.getByRole("button", { name: "Submit vote" }));

      expect(await screen.findByText("Resolution window is closed.")).toBeInTheDocument();
      expect(locationMock.reload).not.toHaveBeenCalled();
    } finally {
      locationMock.restore();
    }
  });

  it("validates challenge reason length before calling the API", async () => {
    const user = userEvent.setup();
    render(
      <CommunityResolvePanel
        {...createProps({
          viewerCanChallenge: true,
          viewerResolverBond: {
            id: "bond-1",
            outcome: "no",
            bondAmount: 4,
            createdAt: "2026-06-22T18:00:00.000Z",
          },
        })}
      />
    );

    expect(screen.getByText(/Only out-voted resolvers can challenge/)).toHaveTextContent(
      "Only out-voted resolvers can challenge. Challenge stake: $4.00."
    );
    await user.type(screen.getByLabelText("Why is the provisional outcome wrong?"), "too short");
    await user.click(screen.getByRole("button", { name: "Submit challenge" }));

    expect(screen.getByText("Challenge reason must be at least 10 characters.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits challenges with the viewer resolver outcome and reloads on success", async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse(true, {}));
    const locationMock = mockLocationReload();
    const user = userEvent.setup();

    try {
      render(
        <CommunityResolvePanel
          {...createProps({
            viewerCanChallenge: true,
            viewerResolverBond: {
              id: "bond-1",
              outcome: "no",
              bondAmount: 4,
              createdAt: "2026-06-22T18:00:00.000Z",
            },
          })}
        />
      );

      await user.type(
        screen.getByLabelText("Why is the provisional outcome wrong?"),
        "The official source contradicts the provisional outcome."
      );
      await user.click(screen.getByRole("button", { name: "Submit challenge" }));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/markets/market-1/dispute",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({
              reason: "The official source contradicts the provisional outcome.",
              proposedOutcome: "no",
            }),
          })
        );
      });
      expect(screen.getByText("Challenge submitted. Human adjudication is now required.")).toBeInTheDocument();
      expect(locationMock.reload).toHaveBeenCalled();
    } finally {
      locationMock.restore();
    }
  });
});
