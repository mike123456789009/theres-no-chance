import { beforeEach, describe, expect, it, vi } from "vitest";

import AccountPage from "./account/page";
import AccountAdminPage from "./account/admin/page";
import LegacyAdminPage from "./admin/page";
import LegacyPortfolioPage from "./portfolio/page";
import LegacyWalletPage from "./wallet/page";

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

beforeEach(() => {
  redirectMock.mockReset();
});

describe("legacy route redirects", () => {
  it("preserves usable wallet query params while redirecting to account wallet", async () => {
    await LegacyWalletPage({
      searchParams: {
        status: "success",
        invoice: ["", "TNC-123"],
        empty: "",
        multi: ["first", "second"],
      },
    });

    expect(redirectMock).toHaveBeenCalledWith("/account/wallet?status=success&invoice=TNC-123&multi=first");
  });

  it("redirects wallet without query params to account wallet", async () => {
    await LegacyWalletPage({});

    expect(redirectMock).toHaveBeenCalledWith("/account/wallet");
  });

  it("redirects portfolio and admin legacy pages to current account pages", () => {
    LegacyPortfolioPage();
    LegacyAdminPage();
    AccountAdminPage();
    AccountPage();

    expect(redirectMock).toHaveBeenNthCalledWith(1, "/account/portfolio");
    expect(redirectMock).toHaveBeenNthCalledWith(2, "/account/admin/market-maker");
    expect(redirectMock).toHaveBeenNthCalledWith(3, "/account/admin/market-maker");
    expect(redirectMock).toHaveBeenNthCalledWith(4, "/account/overview");
  });
});
