// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminResearchRunControls } from "./admin-research-run-controls";

function createResponse(ok: boolean, payload: unknown): Response {
  return {
    ok,
    json: async () => payload,
  } as Response;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AdminResearchRunControls", () => {
  it("runs a public proposal scan with submit enabled and renders summary counts", async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<Response>();
    const fetchMock = vi.fn(() => deferred.promise);
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminResearchRunControls />);

    await user.click(screen.getByRole("button", { name: "Run public proposal scan" }));

    expect(screen.getByRole("button", { name: "Running public scan..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Run institution proposal scan" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/automation/market-research/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ scope: "public", submit: true }),
    });

    deferred.resolve(
      createResponse(true, {
        summary: {
          runId: "run-123",
          status: "completed",
          submitted: 3,
          skippedDuplicate: 4,
          skippedQuality: 5,
          skippedInvalid: 6,
          submitFailed: 1,
        },
      }),
    );

    await screen.findByText("PUBLIC run finished with status: completed.");
    const summary = screen.getByRole("list", { name: "Latest manual run summary" });
    expect(within(summary).getByText("run-123")).toBeInTheDocument();
    expect(within(summary).getByText("Submitted: 3")).toBeInTheDocument();
    expect(within(summary).getByText("Duplicates: 4")).toBeInTheDocument();
    expect(within(summary).getByText("Quality skips: 5")).toBeInTheDocument();
    expect(within(summary).getByText("Invalid skips: 6")).toBeInTheDocument();
    expect(within(summary).getByText("Submit failed: 1")).toBeInTheDocument();
  });

  it("shows API detail for an institution scan failure", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => createResponse(false, { detail: "Institution lock active." }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminResearchRunControls />);

    await user.click(screen.getByRole("button", { name: "Run institution proposal scan" }));

    await screen.findByText("Institution lock active.");
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/automation/market-research/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ scope: "institution", submit: true }),
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Run public proposal scan" })).toBeEnabled());
  });
});
