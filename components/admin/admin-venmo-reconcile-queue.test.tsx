// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminVenmoReconcileQueue } from "./admin-venmo-reconcile-queue";

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

const unmatchedFundingIntent = {
  id: "intent-1",
  createdAt: "2026-06-20T12:00:00.000Z",
  userId: "user-1",
  userEmail: "student@example.edu",
  userDisplayName: "Student User",
  status: "awaiting_payment",
  requestedAmountUsd: 25,
  estimatedFeeUsd: 0.5,
  estimatedNetCreditUsd: 24.5,
  invoiceCode: "TNC-123",
  unmatchedPaymentCount: 2,
};

const unmatchedPayment = {
  id: "incoming-1",
  createdAt: "2026-06-21T12:00:00.000Z",
  gmailMessageId: "gmail-1",
  providerPaymentId: "venmo-1",
  grossAmountUsd: 25,
  computedFeeUsd: 0.5,
  computedNetUsd: 24.5,
  payerDisplayName: "Payer Person",
  payerHandle: "@payer",
  note: "TNC-123",
  extractedInvoiceCode: "TNC-123",
  errorMessage: "Amount mismatch",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

beforeEach(() => {
  routerRefreshMock.mockReset();
});

describe("AdminVenmoReconcileQueue", () => {
  it("requires a funding intent id before manually matching a Venmo payment", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AdminVenmoReconcileQueue
        rows={[unmatchedPayment]}
        unmatchedFundingIntents={[unmatchedFundingIntent]}
        fundingIntentErrorMessage=""
      />,
    );

    expect(screen.getByText("Student User")).toBeInTheDocument();
    expect(screen.getByText("Payer Person")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Match + credit" }));

    expect(screen.getByText("Funding intent id is required to manually match a Venmo payment.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts manual match and ignore actions and refreshes after success", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createResponse(true, { message: "Manual match completed." }))
      .mockResolvedValueOnce(createResponse(true, { message: "Payment ignored." }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AdminVenmoReconcileQueue
        rows={[unmatchedPayment]}
        unmatchedFundingIntents={[unmatchedFundingIntent]}
        fundingIntentErrorMessage=""
      />,
    );

    await user.type(screen.getByLabelText("Funding intent id"), " intent-1 ");
    await user.click(screen.getByRole("button", { name: "Match + credit" }));

    await screen.findByText("Manual match completed.");
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/payments/venmo/match", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        incomingPaymentId: "incoming-1",
        fundingIntentId: "intent-1",
      }),
    });
    expect(screen.getByLabelText("Funding intent id")).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "Ignore" }));
    await screen.findByText("Payment ignored.");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/admin/payments/venmo/ignore", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        incomingPaymentId: "incoming-1",
      }),
    });
    await waitFor(() => expect(routerRefreshMock).toHaveBeenCalledTimes(2));
  });

  it("renders funding intent load errors and empty payment review state", () => {
    render(
      <AdminVenmoReconcileQueue
        rows={[]}
        unmatchedFundingIntents={[]}
        fundingIntentErrorMessage="query failed"
      />,
    );

    expect(screen.getByText("query failed")).toBeInTheDocument();
    expect(screen.getByText("No Venmo payments are waiting for manual review.")).toBeInTheDocument();
  });
});
