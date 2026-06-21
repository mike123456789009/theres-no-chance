// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AccountNav } from "./account-nav";

const mocks = vi.hoisted(() => ({
  pathname: "/account/overview",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

describe("AccountNav", () => {
  beforeEach(() => {
    mocks.pathname = "/account/overview";
  });

  it("shows account sections and active state for non-admin users", () => {
    mocks.pathname = "/account/portfolio";

    render(<AccountNav canAccessAdmin={false} />);

    expect(screen.queryByLabelText("Account mode")).not.toBeInTheDocument();
    expect(screen.getByLabelText("account pages")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Overview/ })).toHaveAttribute("href", "/account/overview");
    expect(screen.getByRole("link", { name: /Portfolio/ })).toHaveClass("is-active");
    expect(screen.getByRole("link", { name: /Wallet/ })).toHaveAttribute("href", "/account/wallet");
  });

  it("shows admin mode and admin sections when the admin path is active", () => {
    mocks.pathname = "/account/admin/users";

    render(<AccountNav canAccessAdmin />);

    expect(screen.getByLabelText("Account mode")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Account/ })).toHaveAttribute("href", "/account/overview");
    expect(screen.getByRole("link", { name: /Admin/ })).toHaveClass("is-active");
    expect(screen.getByLabelText("admin pages")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Users/ })).toHaveClass("is-active");
    expect(screen.getByRole("link", { name: /Payments/ })).toHaveAttribute("href", "/account/admin/payments");
  });
});
