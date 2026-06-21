// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EvidenceSubmissionCard } from "./evidence-submission-card";

type EvidenceCardProps = Parameters<typeof EvidenceSubmissionCard>[0];

function createProps(overrides: Partial<EvidenceCardProps> = {}): EvidenceCardProps {
  return {
    marketId: "market-1",
    marketStatus: "closed",
    canSubmitEvidence: true,
    viewerIsAuthenticated: true,
    evidenceRules: "Use official sources when available.",
    evidence: [],
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

describe("EvidenceSubmissionCard", () => {
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

  it("shows login links to guests and renders an empty evidence feed", () => {
    render(<EvidenceSubmissionCard {...createProps({ viewerIsAuthenticated: false })} />);

    expect(screen.getByRole("heading", { name: "Resolution evidence" })).toBeInTheDocument();
    expect(screen.getByText("Status: Closed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log in to submit evidence" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/signup");
    expect(screen.getByText("No evidence has been submitted yet.")).toBeInTheDocument();
  });

  it("validates that evidence includes a URL or statement before calling the API", async () => {
    const user = userEvent.setup();
    render(<EvidenceSubmissionCard {...createProps()} />);

    await user.click(screen.getByRole("button", { name: "Submit evidence" }));

    expect(screen.getByText("Provide either a URL or a text evidence statement.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders submitted evidence feed items with truncated submitter ids", () => {
    render(
      <EvidenceSubmissionCard
        {...createProps({
          evidence: [
            {
              id: "evidence-1",
              submittedBy: "user-1234567890",
              evidenceUrl: "https://example.edu/final-score",
              evidenceText: "Official score page shows the event completed.",
              notes: "Archived before finalization.",
              submittedOutcome: "yes",
              createdAt: "2026-06-22T18:00:00.000Z",
            },
          ],
        })}
      />
    );

    expect(screen.getByRole("link", { name: "https://example.edu/final-score" })).toHaveAttribute(
      "href",
      "https://example.edu/final-score"
    );
    expect(screen.getByText("Official score page shows the event completed.")).toBeInTheDocument();
    expect(screen.getByText("Notes: Archived before finalization.")).toBeInTheDocument();
    expect(screen.getByText("user-1...7890")).toBeInTheDocument();
    expect(screen.getByText("Yes").closest("p")).toHaveTextContent("Yes claim");
  });

  it("submits evidence payloads, resets form state, and reloads on success", async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse(true, {}));
    const locationMock = mockLocationReload();
    const user = userEvent.setup();

    try {
      render(<EvidenceSubmissionCard {...createProps()} />);

      await user.type(screen.getByLabelText("Evidence URL (optional)"), "https://example.edu/result");
      await user.selectOptions(screen.getByLabelText("Claimed outcome (optional)"), "yes");
      await user.type(screen.getByLabelText("Evidence statement (optional if URL present)"), "Official page confirms yes.");
      await user.type(screen.getByLabelText("Notes (optional)"), "Checked after close.");
      await user.click(screen.getByRole("button", { name: "Submit evidence" }));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/markets/market-1/evidence",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({
              evidenceUrl: "https://example.edu/result",
              evidenceText: "Official page confirms yes.",
              notes: "Checked after close.",
              submittedOutcome: "yes",
            }),
          })
        );
      });
      expect(screen.getByText("Evidence submitted.")).toBeInTheDocument();
      expect(screen.getByLabelText("Evidence URL (optional)")).toHaveValue("");
      expect(locationMock.reload).toHaveBeenCalled();
    } finally {
      locationMock.restore();
    }
  });

  it("surfaces detailed API validation errors without reloading", async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse(false, { details: ["URL is invalid.", "Text is too long."] }));
    const locationMock = mockLocationReload();
    const user = userEvent.setup();

    try {
      render(<EvidenceSubmissionCard {...createProps()} />);

      await user.type(screen.getByLabelText("Evidence statement (optional if URL present)"), "Evidence text.");
      await user.click(screen.getByRole("button", { name: "Submit evidence" }));

      expect(await screen.findByText("URL is invalid. Text is too long.")).toBeInTheDocument();
      expect(locationMock.reload).not.toHaveBeenCalled();
    } finally {
      locationMock.restore();
    }
  });
});
