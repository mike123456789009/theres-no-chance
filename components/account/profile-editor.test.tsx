// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PIXEL_AVATAR_OPTIONS } from "./avatar-options";
import { ProfileEditor } from "./profile-editor";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  upsert: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: mocks.getUser,
      updateUser: mocks.updateUser,
    },
    from: () => ({
      upsert: mocks.upsert,
    }),
  }),
}));

vi.mock("@/components/theme/ui-style-sync", () => ({
  useUiStyle: () => ({
    uiStyle: "retro",
    uiPalette: "default",
    setUiStyle: vi.fn(),
    setUiPalette: vi.fn(),
    cycleUiPalette: vi.fn(),
  }),
}));

describe("ProfileEditor", () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.upsert.mockReset();
    mocks.updateUser.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("validates short display names before saving", async () => {
    const user = userEvent.setup();

    render(<ProfileEditor initialDisplayName="Alpha Trader" initialAvatarUrl={PIXEL_AVATAR_OPTIONS[0].url} />);

    const nameInput = screen.getByLabelText("Display name");
    await user.clear(nameInput);
    await user.type(nameInput, "A");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(screen.getByText("Display name must be at least 2 characters.")).toBeInTheDocument();
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("normalizes the display name, saves the selected avatar, and syncs auth metadata", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: "user-1" } }, error: null });
    mocks.upsert.mockResolvedValueOnce({ error: null });
    mocks.updateUser.mockResolvedValueOnce({ error: null });
    const user = userEvent.setup();

    render(<ProfileEditor initialDisplayName="Alpha Trader" initialAvatarUrl={PIXEL_AVATAR_OPTIONS[0].url} />);

    const nameInput = screen.getByLabelText("Display name");
    await user.clear(nameInput);
    await user.type(nameInput, "  Michael   Callow  ");
    await user.click(screen.getByRole("button", { name: /Ranger/ }));
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => {
      expect(mocks.upsert).toHaveBeenCalledWith(
        {
          id: "user-1",
          display_name: "Michael Callow",
          avatar_url: PIXEL_AVATAR_OPTIONS[1].url,
          ui_style: "retro",
        },
        { onConflict: "id" }
      );
    });
    expect(mocks.updateUser).toHaveBeenCalledWith({
      data: {
        display_name: "Michael Callow",
        avatar_url: PIXEL_AVATAR_OPTIONS[1].url,
        ui_style: "retro",
      },
    });
    expect(screen.getByText("Profile updated.")).toBeInTheDocument();
    expect(nameInput).toHaveValue("Michael Callow");
  });

  it("surfaces metadata sync failures after the profile row is saved", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: "user-1" } }, error: null });
    mocks.upsert.mockResolvedValueOnce({ error: null });
    mocks.updateUser.mockResolvedValueOnce({ error: { message: "metadata locked" } });
    const user = userEvent.setup();

    render(<ProfileEditor initialDisplayName="Alpha Trader" initialAvatarUrl={PIXEL_AVATAR_OPTIONS[0].url} />);

    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(
      await screen.findByText("Profile saved, but auth metadata failed to sync: metadata locked")
    ).toBeInTheDocument();
  });
});
