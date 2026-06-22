import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const retiredProviderPaths = [
  "lib/payments/stripe.ts",
  "lib/payments/stripe-webhook.ts",
  "lib/payments/coinbase.ts",
  "lib/payments/coinbase-webhook.ts",
  "app/api/payments/stripe/checkout/route.ts",
  "app/api/payments/coinbase/charge/route.ts",
  "app/api/webhooks/stripe/route.ts",
  "app/api/webhooks/coinbase/route.ts",
];

describe("retired payment provider boundary", () => {
  it("keeps Stripe and Coinbase runtime paths out of the active app tree", () => {
    const presentPaths = retiredProviderPaths.filter((relativePath) => existsSync(path.join(process.cwd(), relativePath)));

    expect(presentPaths).toEqual([]);
  });
});
