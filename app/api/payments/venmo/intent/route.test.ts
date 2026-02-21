import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  isSupabaseServerEnvConfigured: vi.fn(() => true),
  getMissingSupabaseServerEnv: vi.fn(() => []),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(),
  isSupabaseServiceEnvConfigured: vi.fn(() => true),
  getMissingSupabaseServiceEnv: vi.fn(() => []),
}));

vi.mock("@/lib/payments/venmo", () => ({
  generateInvoiceCode: vi.fn(() => "VC-TEST23"),
  buildRequiredVenmoNote: vi.fn((invoiceCode: string) => invoiceCode),
  getVenmoPayUrl: vi.fn(() => "https://account.venmo.com/u/TheresNoChance"),
  getVenmoQrImageUrl: vi.fn(() => "/assets/payments/venmo-theres-no-chance-qr.png"),
  getVenmoUsername: vi.fn(() => "TheresNoChance"),
}));

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const ORIGINAL_ENV = { ...process.env };

describe("POST /api/payments/venmo/intent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns gross/fee/net estimates and required invoice fields", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
    } as any);

    const insert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn(() => ({
        insert,
      })),
    } as any);

    const request = new Request("http://localhost/api/payments/venmo/intent", {
      method: "POST",
      body: JSON.stringify({
        amountUsd: 10,
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.invoiceCode).toBe("VC-TEST23");
    expect(json.requiredNote).toBe("VC-TEST23");
    expect(json.grossAmountUsd).toBe(10);
    expect(json.estimatedFeeUsd).toBe(0);
    expect(json.estimatedNetCreditUsd).toBe(10);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("allows small gross deposits because fee is applied on withdrawal", async () => {
    process.env.DEPOSIT_MIN_USD = "0.01";
    process.env.DEPOSIT_MAX_USD = "10";
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
    } as any);

    const insert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn(() => ({
        insert,
      })),
    } as any);

    const request = new Request("http://localhost/api/payments/venmo/intent", {
      method: "POST",
      body: JSON.stringify({
        amountUsd: 0.01,
      }),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.estimatedFeeUsd).toBe(0);
    expect(json.estimatedNetCreditUsd).toBe(0.01);
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
