// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminReviewQueue } from "./admin-review-queue";

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

const reviewMarket = {
  id: "review-market-1",
  question: "Will the dining hall extend hours this semester?",
  status: "review" as const,
  closeTime: "2026-08-20T22:00:00.000Z",
  createdAt: "2026-06-20T12:00:00.000Z",
  creatorId: "creator-review",
  tags: ["campus", "food"],
};

const openMarket = {
  id: "open-market-1",
  question: "Will the team win the opener?",
  status: "open" as const,
  closeTime: "2026-09-01T22:00:00.000Z",
  createdAt: "2026-06-19T12:00:00.000Z",
  creatorId: "creator-open",
  tags: ["sports"],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

beforeEach(() => {
  routerRefreshMock.mockReset();
});

describe("AdminReviewQueue", () => {
  it("renders empty review and halt queues", () => {
    render(<AdminReviewQueue reviewMarkets={[]} openMarkets={[]} />);

    expect(screen.getByText("No markets are currently waiting for review.")).toBeInTheDocument();
    expect(screen.getByText("No open markets available for halt controls right now.")).toBeInTheDocument();
  });

  it("approves a review market with a trimmed admin note and refreshes", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => createResponse(true, { message: "Market opened." }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminReviewQueue reviewMarkets={[reviewMarket]} openMarkets={[openMarket]} />);

    await user.type(screen.getByLabelText("Admin note (optional)"), "  objective market  ");
    await user.click(screen.getByRole("button", { name: "Approve + open" }));

    await screen.findByText("Market opened.");
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/markets/review-market-1/approve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason: "objective market" }),
    });
    expect(screen.getByLabelText("Admin note (optional)")).toHaveValue("");
    expect(routerRefreshMock).toHaveBeenCalledTimes(1);
  });

  it("shows API errors and can halt an open market with a reason", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createResponse(false, { error: "Reject failed." }))
      .mockResolvedValueOnce(createResponse(true, { message: "Trading halted." }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminReviewQueue reviewMarkets={[reviewMarket]} openMarkets={[openMarket]} />);

    await user.click(screen.getByRole("button", { name: "Reject to draft" }));
    await screen.findByText("Reject failed.");
    expect(routerRefreshMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Halt reason (optional)"), "bad source");
    await user.click(screen.getByRole("button", { name: "Halt trading" }));

    await screen.findByText("Trading halted.");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/admin/markets/open-market-1/halt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason: "bad source" }),
    });
    await waitFor(() => expect(routerRefreshMock).toHaveBeenCalledTimes(1));
  });
});
