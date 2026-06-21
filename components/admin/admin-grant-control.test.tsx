// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminGrantControl } from "./admin-grant-control";

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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

beforeEach(() => {
  routerRefreshMock.mockReset();
});

describe("AdminGrantControl", () => {
  it("shows a read-only state when the selected user is already admin", () => {
    render(
      <AdminGrantControl
        targetUserId="user-admin"
        targetUserEmail="admin@example.edu"
        targetDisplayName="Existing Admin"
        alreadyAdmin
      />,
    );

    expect(screen.getByLabelText("User already has admin access")).toHaveTextContent("Existing Admin already has platform admin access.");
    expect(screen.queryByRole("button", { name: "Step 1: Start admin grant" })).not.toBeInTheDocument();
  });

  it("blocks granting when the target user has no email", () => {
    render(
      <AdminGrantControl
        targetUserId="user-no-email"
        targetUserEmail=""
        targetDisplayName="No Email"
        alreadyAdmin={false}
      />,
    );

    expect(screen.getByText("Cannot grant admin: target user has no email.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Step 1: Start admin grant" })).toBeDisabled();
  });

  it("requires two-step confirmation, exact phrase, and target email before posting", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => createResponse(true, { message: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AdminGrantControl
        targetUserId="user-1"
        targetUserEmail="Student@Example.edu"
        targetDisplayName="Student User"
        alreadyAdmin={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Step 1: Start admin grant" }));

    const submit = screen.getByRole("button", { name: "Confirm grant admin access" });
    expect(submit).toBeDisabled();

    await user.click(screen.getByLabelText("I understand this user will be able to control markets, resolutions, and admin settings."));
    await user.type(screen.getByLabelText("Type the exact user email to confirm"), "student@example.edu");
    await user.type(screen.getByLabelText("Type confirmation phrase: GRANT ADMIN"), "GRANT ADMIN");

    expect(submit).toBeEnabled();
    await user.click(submit);

    await screen.findByText("Platform admin role granted successfully.");
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/users/user-1/grant-platform-admin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        confirmIntent: "grant_platform_admin",
        confirmAcknowledge: true,
        confirmTargetEmail: "student@example.edu",
        confirmPhrase: "GRANT ADMIN",
      }),
    });
    await waitFor(() => expect(routerRefreshMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Step 1: Start admin grant" })).toBeInTheDocument();
  });

  it("shows route errors without refreshing", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () => createResponse(false, { detail: "Confirmation mismatch." }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AdminGrantControl
        targetUserId="user-1"
        targetUserEmail="student@example.edu"
        targetDisplayName="Student User"
        alreadyAdmin={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Step 1: Start admin grant" }));
    await user.click(screen.getByLabelText("I understand this user will be able to control markets, resolutions, and admin settings."));
    await user.type(screen.getByLabelText("Type the exact user email to confirm"), "student@example.edu");
    await user.type(screen.getByLabelText("Type confirmation phrase: GRANT ADMIN"), "GRANT ADMIN");
    await user.click(screen.getByRole("button", { name: "Confirm grant admin access" }));

    await screen.findByText("Confirmation mismatch.");
    expect(routerRefreshMock).not.toHaveBeenCalled();
  });
});
