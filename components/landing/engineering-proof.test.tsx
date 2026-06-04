// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EngineeringProof, ENGINEERING_PROOF_ITEMS } from "@/components/landing/engineering-proof";

describe("EngineeringProof", () => {
  it("renders the product proof needed by the public landing page", () => {
    render(<EngineeringProof />);

    expect(screen.getByRole("heading", { name: /public landing page backed by real product surfaces/i })).toBeInTheDocument();
    for (const item of ENGINEERING_PROOF_ITEMS) {
      expect(screen.getByRole("heading", { name: item.label })).toBeInTheDocument();
      expect(screen.getByText(item.body)).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: /browse markets/i })).toHaveAttribute("href", "/markets");
    expect(screen.getByRole("link", { name: /read resolution flow/i })).toHaveAttribute("href", "/community-resolve");
  });
});
