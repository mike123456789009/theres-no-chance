// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DepositPanel } from "./deposit-panel";

describe("DepositPanel", () => {
  it("renders Venmo as the only funding option", () => {
    const { container } = render(
      <DepositPanel
        minDepositUsd={5}
        maxDepositUsd={2500}
        quickAmountsUsd={[25, 50, 100]}
        venmoUsername="TheresNoChance"
        venmoPayUrl="https://account.venmo.com/u/TheresNoChance"
        venmoQrImageUrl="/assets/payments/venmo-theres-no-chance-qr.png"
        venmoFeePercent={1.9}
        venmoFeeFixedUsd={0.1}
      />
    );

    expect(screen.getByRole("heading", { name: "Deposit" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Venmo (manual reconciliation)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate Venmo payment code" })).toBeInTheDocument();
    expect(container.querySelectorAll(".deposit-provider-card")).toHaveLength(1);
  });
});
