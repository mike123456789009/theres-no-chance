// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OnboardingForm } from "./onboarding-form";

const mocks = vi.hoisted(() => ({
  updateUser: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      updateUser: mocks.updateUser,
    },
  }),
}));

describe("OnboardingForm", () => {
  beforeEach(() => {
    mocks.updateUser.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("requires at least one interest before saving", async () => {
    const user = userEvent.setup();

    render(<OnboardingForm />);

    await user.type(screen.getByLabelText("City or region"), "Bozeman, MT");
    await user.click(screen.getByRole("button", { name: "SAVE ONBOARDING" }));

    expect(screen.getByText("Select at least one interest to continue.")).toBeInTheDocument();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("saves city, selected interests, and completion timestamp to auth metadata", async () => {
    mocks.updateUser.mockResolvedValueOnce({ error: null });
    const user = userEvent.setup();

    render(<OnboardingForm />);

    await user.type(screen.getByLabelText("City or region"), " Bozeman, MT ");
    await user.click(screen.getByRole("button", { name: "Sports" }));
    await user.click(screen.getByRole("button", { name: "Campus Life" }));
    await user.click(screen.getByRole("button", { name: "SAVE ONBOARDING" }));

    await waitFor(() => {
      expect(mocks.updateUser).toHaveBeenCalledWith({
        data: {
          onboarding_city_region: "Bozeman, MT",
          onboarding_interests: ["Sports", "Campus Life"],
          onboarding_completed_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        },
      });
    });
    expect(screen.getByText("Onboarding saved. You can continue to market discovery as features launch.")).toBeInTheDocument();
  });

  it("surfaces Supabase update errors", async () => {
    mocks.updateUser.mockResolvedValueOnce({ error: { message: "Session expired" } });
    const user = userEvent.setup();

    render(<OnboardingForm />);

    await user.type(screen.getByLabelText("City or region"), "Claremont, CA");
    await user.click(screen.getByRole("button", { name: "Education" }));
    await user.click(screen.getByRole("button", { name: "SAVE ONBOARDING" }));

    expect(await screen.findByText("Session expired")).toBeInTheDocument();
  });
});
