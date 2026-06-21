// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UiPalette, UiStyle } from "@/lib/theme/types";

import { StyleToggle } from "./style-toggle";
import { UiStyleSync, useUiStyle } from "./ui-style-sync";

const getUserMock = vi.hoisted(() => vi.fn());
const upsertProfileMock = vi.hoisted(() => vi.fn());
const updateUserMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: getUserMock,
      updateUser: updateUserMock,
    },
    from: (table: string) => {
      if (table !== "profiles") throw new Error(`Unexpected table ${table}`);
      return {
        upsert: upsertProfileMock,
      };
    },
  }),
}));

function TestPanel() {
  const { uiStyle, uiPalette } = useUiStyle();

  return (
    <>
      <StyleToggle />
      <p data-testid="current-theme">
        {uiStyle}:{uiPalette}
      </p>
    </>
  );
}

function renderTheme(initialStyle: UiStyle = "retro", initialPalette: UiPalette = "hearth") {
  return render(
    <UiStyleSync initialStyle={initialStyle} initialPalette={initialPalette}>
      <TestPanel />
    </UiStyleSync>,
  );
}

function expireCookie(name: string) {
  document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  window.localStorage.clear();
  expireCookie("tnc-ui-style");
  expireCookie("tnc-ui-palette");
  document.documentElement.removeAttribute("data-ui-style");
  document.documentElement.removeAttribute("data-ui-palette");
  document.body.removeAttribute("data-ui-style");
  document.body.removeAttribute("data-ui-palette");
  window.history.replaceState(null, "", "/");
  getUserMock.mockReset();
  upsertProfileMock.mockReset();
  updateUserMock.mockReset();
  getUserMock.mockResolvedValue({
    data: {
      user: {
        id: "user-1",
      },
    },
    error: null,
  });
  upsertProfileMock.mockResolvedValue({ error: null });
  updateUserMock.mockResolvedValue({ error: null });
});

describe("UiStyleSync and StyleToggle", () => {
  it("applies initial style and palette to DOM, storage, cookies, and toggle state", async () => {
    renderTheme("retro", "hearth");

    await waitFor(() => expect(document.documentElement.dataset.uiStyle).toBe("retro"));

    expect(document.body.dataset.uiStyle).toBe("retro");
    expect(document.documentElement.dataset.uiPalette).toBe("hearth");
    expect(window.localStorage.getItem("tnc-ui-style")).toBe("retro");
    expect(window.localStorage.getItem("tnc-ui-palette")).toBe("hearth");
    expect(document.cookie).toContain("tnc-ui-style=retro");
    expect(document.cookie).toContain("tnc-ui-palette=hearth");
    expect(screen.getByRole("button", { name: "Retro" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("group", { name: "Modern vibe" })).not.toBeInTheDocument();
  });

  it("switches style, syncs profile metadata, cycles palette, and emits DOM events", async () => {
    const user = userEvent.setup();
    const styleListener = vi.fn();
    const paletteListener = vi.fn();
    window.addEventListener("tnc:ui-style-changed", styleListener);
    window.addEventListener("tnc:ui-palette-changed", paletteListener);

    renderTheme("retro", "hearth");

    await user.click(screen.getByRole("button", { name: "Modern" }));

    await waitFor(() => expect(screen.getByTestId("current-theme")).toHaveTextContent("modern:hearth"));
    expect(document.documentElement.dataset.uiStyle).toBe("modern");
    expect(window.localStorage.getItem("tnc-ui-style")).toBe("modern");
    expect(upsertProfileMock).toHaveBeenCalledWith(
      {
        id: "user-1",
        ui_style: "modern",
      },
      {
        onConflict: "id",
      },
    );
    expect(updateUserMock).toHaveBeenCalledWith({
      data: {
        ui_style: "modern",
      },
    });
    expect(screen.getByRole("button", { name: "Modern" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Cycle modern vibe. Current vibe is Hearth" }));

    await waitFor(() => expect(screen.getByTestId("current-theme")).toHaveTextContent("modern:sand"));
    expect(document.documentElement.dataset.uiPalette).toBe("sand");
    expect(document.body.dataset.uiPalette).toBe("sand");
    expect(window.localStorage.getItem("tnc-ui-palette")).toBe("sand");
    expect(document.cookie).toContain("tnc-ui-palette=sand");
    expect(styleListener).toHaveBeenCalled();
    expect(paletteListener).toHaveBeenCalled();

    window.removeEventListener("tnc:ui-style-changed", styleListener);
    window.removeEventListener("tnc:ui-palette-changed", paletteListener);
  });

  it("honors stored style and query palette, then supports explicit palette selection", async () => {
    const user = userEvent.setup();
    document.cookie = "tnc-ui-style=modern; path=/";
    window.localStorage.setItem("tnc-ui-style", "retro");
    window.localStorage.setItem("tnc-ui-palette", "sand");
    window.history.replaceState(null, "", "/markets?palette=cosmos");

    renderTheme("retro", "hearth");

    await waitFor(() => expect(screen.getByTestId("current-theme")).toHaveTextContent("modern:cosmos"));
    expect(document.documentElement.dataset.uiStyle).toBe("modern");
    expect(document.documentElement.dataset.uiPalette).toBe("cosmos");
    expect(screen.getByRole("button", { name: "Modern" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Select modern vibe. Current vibe is Cosmos" }));
    await user.click(screen.getByRole("option", { name: "Aurora" }));

    await waitFor(() => expect(screen.getByTestId("current-theme")).toHaveTextContent("modern:aurora"));
    expect(document.documentElement.dataset.uiPalette).toBe("aurora");
    expect(screen.getByRole("button", { name: "Select modern vibe. Current vibe is Aurora" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});
