// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import MarketingPage from "@/app/(marketing)/page";

vi.mock("@/components/theme/style-toggle", () => ({
  StyleToggle: () => <div data-testid="style-toggle" />,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: () => undefined,
  }),
}));

describe("MarketingPage", () => {
  it("keeps the floating style toggle inside a labelled landmark", () => {
    render(<MarketingPage />);

    const displayOptions = screen.getByRole("complementary", { name: /display options/i });
    expect(displayOptions).toHaveClass("style-toggle-floating");
    expect(within(displayOptions).getByTestId("style-toggle")).toBeInTheDocument();
    expect(document.querySelector('script[src="/script.js"]')).toHaveAttribute("crossorigin", "anonymous");
  });

  it("describes withdrawals as API/admin-assisted until self-serve cashouts ship", () => {
    render(<MarketingPage />);

    const payments = screen.getByRole("region", { name: /payments and token economy/i });
    expect(within(payments).getByText(/self-serve cashouts are not exposed yet/i)).toBeInTheDocument();
    expect(
      screen.getByText(/withdrawal requests run through eligibility checks and admin or api workflows/i),
    ).toBeInTheDocument();
  });

  it("keeps the full-bleed hero from using scrollbar-inclusive viewport width", () => {
    const css = readFileSync(join(process.cwd(), "app/styles/base.css"), "utf8");
    const heroRule = css.match(/\.hero-3d-wrap\s*{[^}]+}/)?.[0] ?? "";

    expect(heroRule).toContain("width: calc(100% + var(--stage-pad) + var(--stage-pad));");
    expect(heroRule).not.toContain("width: 100vw");
  });
});
