// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HeroBootFallback } from "@/components/landing/hero-boot-fallback";

describe("HeroBootFallback", () => {
  it("renders the branded fallback copy for the landing hero boot state", () => {
    render(<HeroBootFallback />);

    const fallback = screen.getByText("THERE'S").closest(".hero-boot-fallback");

    expect(fallback).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("NO")).toBeInTheDocument();
    expect(screen.getByText("/")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("CHANCE")).toBeInTheDocument();
  });
});
