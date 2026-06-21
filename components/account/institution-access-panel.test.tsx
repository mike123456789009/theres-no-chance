// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InstitutionAccessPanel } from "./institution-access-panel";

function mockJsonResponse(ok: boolean, payload: unknown, status = ok ? 200 : 400): Response {
  return {
    ok,
    status,
    json: async () => payload,
  } as Response;
}

function createSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    activeMembership: null,
    verifiedInstitutionEmails: [],
    pendingChallenge: null,
    canCreateInstitutionMarkets: false,
    ...overrides,
  };
}

describe("InstitutionAccessPanel", () => {
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

  it("loads and renders active membership plus verified institution emails", async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse(
        true,
        createSnapshot({
          activeMembership: {
            organizationName: "Claremont McKenna College",
            verifiedAt: "2026-06-21T18:00:00.000Z",
          },
          verifiedInstitutionEmails: [
            {
              id: "email-1",
              email: "student@cmc.edu",
              organizationName: "Claremont McKenna College",
              verifiedAt: "2026-06-21T18:00:00.000Z",
            },
          ],
          canCreateInstitutionMarkets: true,
        })
      )
    );

    render(<InstitutionAccessPanel />);

    expect((await screen.findByText(/Active institution:/)).closest("p")).toHaveTextContent("Claremont McKenna College");
    expect(screen.getByText(/student@cmc.edu/)).toHaveTextContent("student@cmc.edu");
    expect(fetchMock).toHaveBeenCalledWith("/api/account/institution-access", {
      method: "GET",
      cache: "no-store",
    });
  });

  it("handles ambiguous institution candidates before resending the code", async () => {
    fetchMock
      .mockResolvedValueOnce(mockJsonResponse(true, createSnapshot()))
      .mockResolvedValueOnce(
        mockJsonResponse(
          false,
          {
            code: "AMBIGUOUS_INSTITUTION",
            candidates: [
              {
                organizationId: "org-1",
                organizationName: "Example College",
                matchedDomain: "example.edu",
                matchType: "primary",
              },
            ],
          },
          409
        )
      );
    const user = userEvent.setup();

    render(<InstitutionAccessPanel />);

    await screen.findByText("No active institution membership yet.");
    await user.type(screen.getByLabelText("Institution email"), "student@example.edu");
    await user.click(screen.getByRole("button", { name: "Send institution verification code" }));

    expect(await screen.findByText("Multiple institutions matched this email domain. Select one and send the code again.")).toBeInTheDocument();
    expect(screen.getByLabelText("Select matching institution")).toHaveValue("org-1");
    expect(screen.getByText(/Selected institution:/)).toHaveTextContent("Example College");
  });

  it("asks for a new institution name when no organization matches the email domain", async () => {
    fetchMock
      .mockResolvedValueOnce(mockJsonResponse(true, createSnapshot()))
      .mockResolvedValueOnce(
        mockJsonResponse(
          false,
          {
            code: "NO_INSTITUTION_MATCH",
          },
          409
        )
      );
    const user = userEvent.setup();

    render(<InstitutionAccessPanel />);

    await screen.findByText("No active institution membership yet.");
    await user.type(screen.getByLabelText("Institution email"), "student@newschool.edu");
    await user.click(screen.getByRole("button", { name: "Send institution verification code" }));

    expect(await screen.findByText("No institution matched this domain yet. Add a new institution name, then send again.")).toBeInTheDocument();
    expect(screen.getByLabelText("New institution name")).toBeRequired();
    expect(screen.queryByLabelText("Select matching institution")).not.toBeInTheDocument();
  });

  it("verifies pending challenge codes and reloads the access snapshot", async () => {
    fetchMock
      .mockResolvedValueOnce(
        mockJsonResponse(
          true,
          createSnapshot({
            pendingChallenge: {
              challengeId: "challenge-1",
              email: "student@college.edu",
              organizationName: "Example College",
              expiresAt: "2026-06-21T19:00:00.000Z",
            },
          })
        )
      )
      .mockResolvedValueOnce(
        mockJsonResponse(true, {
          verified: {
            organizationName: "Example College",
          },
        })
      )
      .mockResolvedValueOnce(
        mockJsonResponse(
          true,
          createSnapshot({
            activeMembership: {
              organizationName: "Example College",
              verifiedAt: "2026-06-21T18:30:00.000Z",
            },
          })
        )
      );
    const user = userEvent.setup();

    render(<InstitutionAccessPanel />);

    await screen.findByText(/Pending code for/);
    await user.type(screen.getByLabelText("Verification code"), "12ab3456");
    expect(screen.getByLabelText("Verification code")).toHaveValue("123456");
    await user.click(screen.getByRole("button", { name: "Verify institution code" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/account/institution-email/verify",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            challengeId: "challenge-1",
            code: "123456",
          }),
        })
      );
    });
    expect(await screen.findByText("Institution access verified. Active institution is now Example College.")).toBeInTheDocument();
    expect(screen.getByText(/Active institution:/).closest("p")).toHaveTextContent("Example College");
  });
});
