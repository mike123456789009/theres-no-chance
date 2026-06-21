// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import type React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CommunityResolvePage from "@/app/(marketing)/community-resolve/page";

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("CommunityResolvePage", () => {
  let rafCallbacks: FrameRequestCallback[];

  beforeEach(() => {
    rafCallbacks = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: 1000 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function flushAnimationFrames() {
    const callbacks = rafCallbacks.splice(0);
    act(() => {
      callbacks.forEach((callback) => callback(performance.now()));
    });
  }

  function setScrollState(scrollY: number, scrollHeight: number) {
    Object.defineProperty(window, "scrollY", { configurable: true, writable: true, value: scrollY });
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      value: scrollHeight,
    });
    Object.defineProperty(document.body, "scrollHeight", {
      configurable: true,
      value: scrollHeight,
    });
  }

  function mockStageRects(rects: Record<string, Pick<DOMRect, "bottom" | "height" | "top">>) {
    document.querySelectorAll<HTMLElement>("[data-stage-id]").forEach((stage) => {
      const stageId = stage.dataset.stageId;
      if (!stageId || !rects[stageId]) return;
      stage.getBoundingClientRect = vi.fn(() => ({
        ...rects[stageId],
        left: 0,
        right: 800,
        width: 800,
        x: 0,
        y: rects[stageId].top,
        toJSON: () => undefined,
      }));
    });
  }

  it("renders the stage links and all eight lifecycle stages", () => {
    render(<CommunityResolvePage />);

    expect(screen.getByRole("link", { name: "Open market maker wizard" })).toHaveAttribute("href", "/create");
    expect(screen.getByRole("link", { name: "Browse markets" })).toHaveAttribute("href", "/markets");
    expect(screen.getAllByText(/Market Opens/)).not.toHaveLength(0);
    expect(screen.getAllByText(/Settlement/)).not.toHaveLength(0);
    expect(screen.getByLabelText("Community resolve timeline")).toBeInTheDocument();
  });

  it("activates the settlement stage when the user reaches the bottom of the page", async () => {
    render(<CommunityResolvePage />);
    setScrollState(1000, 2000);
    mockStageRects({
      open: { top: -2600, bottom: -2300, height: 300 },
      close: { top: -2200, bottom: -1900, height: 300 },
      stake: { top: -1800, bottom: -1500, height: 300 },
      provisional: { top: -1400, bottom: -1100, height: 300 },
      "auto-finalize": { top: -1000, bottom: -700, height: 300 },
      challenge: { top: -500, bottom: -200, height: 300 },
      adjudication: { top: 100, bottom: 400, height: 300 },
      settlement: { top: 540, bottom: 840, height: 300 },
    });

    const settlementRailItem = screen.getAllByText("Settlement").find((node) => node.closest("li"))?.closest("li");

    flushAnimationFrames();
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    flushAnimationFrames();

    await waitFor(() => {
      expect(settlementRailItem).toHaveClass("is-active");
      expect(document.querySelector(".community-resolve-active-media")?.textContent).toContain(
        "Final payouts and treasury split",
      );
    });
  });
});
