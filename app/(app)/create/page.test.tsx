// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getMissingSupabaseServerEnv: vi.fn(),
  isSupabaseServerEnvConfigured: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
  getMissingSupabaseServerEnv: mocks.getMissingSupabaseServerEnv,
  isSupabaseServerEnvConfigured: mocks.isSupabaseServerEnvConfigured,
}));

vi.mock("@/components/markets/create-market-form", () => ({
  CreateMarketForm: () => <div data-testid="create-market-form">Create market form</div>,
}));

import CreateMarketPage from "./page";

function createSupabaseUserMock(user: { id: string; email: string } | null) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user },
      })),
    },
  };
}

describe("/create page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isSupabaseServerEnvConfigured.mockReturnValue(true);
    mocks.getMissingSupabaseServerEnv.mockReturnValue([]);
    mocks.createClient.mockResolvedValue(createSupabaseUserMock({ id: "user-1", email: "maker@example.edu" }));
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a configuration error without touching auth when Supabase env is missing", async () => {
    mocks.isSupabaseServerEnvConfigured.mockReturnValue(false);
    mocks.getMissingSupabaseServerEnv.mockReturnValue(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]);

    render(await CreateMarketPage());

    expect(screen.getByRole("heading", { name: "Market Creation Unavailable" })).toBeInTheDocument();
    expect(screen.getByText(/Missing env vars:/)).toHaveTextContent(
      "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
    expect(screen.getByRole("link", { name: "home" })).toHaveAttribute("href", "/");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated users to login", async () => {
    mocks.createClient.mockResolvedValueOnce(createSupabaseUserMock(null));

    await expect(CreateMarketPage()).rejects.toThrow("redirect:/login");

    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });

  it("renders the market maker wizard for authenticated users", async () => {
    render(await CreateMarketPage());

    expect(screen.getByRole("heading", { name: "Market maker wizard" })).toBeInTheDocument();
    expect(screen.getByText(/Build your market step-by-step/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Community Resolve" })).toHaveAttribute("href", "/community-resolve");
    expect(screen.getByTestId("create-market-form")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "public markets" })).toHaveAttribute("href", "/markets");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
