import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(),
  isSupabaseServiceEnvConfigured: vi.fn(() => true),
  getMissingSupabaseServiceEnv: vi.fn(() => []),
}));

vi.mock("@/lib/payments/coinbase", () => ({
  verifyCoinbaseWebhookSignature: vi.fn(() => true),
}));

vi.mock("@/lib/payments/coinbase-webhook", () => ({
  processCoinbaseWebhookEvent: vi.fn(),
}));

import { processCoinbaseWebhookEvent } from "@/lib/payments/coinbase-webhook";
import { verifyCoinbaseWebhookSignature } from "@/lib/payments/coinbase";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

function createWebhookEventsServiceMock(options?: {
  insertResult?: { data: { id?: string } | null; error: { code?: string; message: string } | null };
  finalizeUpdateError?: { message: string } | null;
  failureUpdateError?: { message: string } | null;
}) {
  const insertResult = options?.insertResult ?? {
    data: { id: "webhook-1" },
    error: null,
  };
  const finalizeUpdateError = options?.finalizeUpdateError ?? null;
  const failureUpdateError = options?.failureUpdateError ?? null;

  const insertSingle = vi.fn().mockResolvedValue(insertResult);
  const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
  const insert = vi.fn().mockReturnValue({ select: insertSelect });

  const updateEq = vi
    .fn()
    .mockResolvedValueOnce({ error: finalizeUpdateError })
    .mockResolvedValue({ error: failureUpdateError });
  const update = vi.fn().mockReturnValue({ eq: updateEq });

  return {
    from: vi.fn(() => ({
      insert,
      update,
    })),
    mocks: {
      insertSingle,
      updateEq,
    },
  };
}

function createValidEnvelopeBody() {
  return JSON.stringify({
    id: "envelope-123",
    event: {
      id: "event-123",
      type: "charge:confirmed",
      data: {
        id: "charge-123",
      },
    },
  });
}

describe("POST /api/webhooks/coinbase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isSupabaseServiceEnvConfigured).mockReturnValue(true);
    vi.mocked(getMissingSupabaseServiceEnv).mockReturnValue([]);
    vi.mocked(verifyCoinbaseWebhookSignature).mockReturnValue(true);
    vi.mocked(processCoinbaseWebhookEvent).mockResolvedValue({
      processed: true,
      ignored: false,
      details: ["Coinbase deposit credited."],
    });
  });

  it("returns 503 with missingEnv when service env is unavailable", async () => {
    vi.mocked(isSupabaseServiceEnvConfigured).mockReturnValue(false);
    vi.mocked(getMissingSupabaseServiceEnv).mockReturnValue(["SUPABASE_SERVICE_ROLE_KEY"]);

    const response = await POST(
      new Request("http://localhost/api/webhooks/coinbase", {
        method: "POST",
        body: createValidEnvelopeBody(),
      })
    );
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error).toBe("Coinbase webhook processing unavailable: missing service role configuration.");
    expect(json.missingEnv).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("returns 400 for invalid signatures", async () => {
    vi.mocked(verifyCoinbaseWebhookSignature).mockReturnValue(false);
    vi.mocked(createServiceClient).mockReturnValue(createWebhookEventsServiceMock() as any);

    const response = await POST(
      new Request("http://localhost/api/webhooks/coinbase", {
        method: "POST",
        headers: {
          "x-cc-webhook-signature": "bad-signature",
        },
        body: createValidEnvelopeBody(),
      })
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("Invalid Coinbase signature.");
  });

  it("returns 200 duplicate response on unique violation", async () => {
    const service = createWebhookEventsServiceMock({
      insertResult: {
        data: null,
        error: {
          code: "23505",
          message: "duplicate key",
        },
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(service as any);

    const response = await POST(
      new Request("http://localhost/api/webhooks/coinbase", {
        method: "POST",
        headers: {
          "x-cc-webhook-signature": "valid-signature",
        },
        body: createValidEnvelopeBody(),
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.received).toBe(true);
    expect(json.duplicate).toBe(true);
    expect(vi.mocked(processCoinbaseWebhookEvent)).not.toHaveBeenCalled();
  });

  it("returns 500 and marks webhook failed when processing throws", async () => {
    const service = createWebhookEventsServiceMock();
    vi.mocked(createServiceClient).mockReturnValue(service as any);
    vi.mocked(processCoinbaseWebhookEvent).mockRejectedValue(new Error("provider processing failed"));

    const response = await POST(
      new Request("http://localhost/api/webhooks/coinbase", {
        method: "POST",
        headers: {
          "x-cc-webhook-signature": "valid-signature",
        },
        body: createValidEnvelopeBody(),
      })
    );
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe("Coinbase webhook processing failed.");
    expect(json.detail).toContain("provider processing failed");
    expect(service.mocks.updateEq).toHaveBeenCalled();
  });

  it("returns 200 with processed payload on success", async () => {
    const service = createWebhookEventsServiceMock();
    vi.mocked(createServiceClient).mockReturnValue(service as any);

    const response = await POST(
      new Request("http://localhost/api/webhooks/coinbase", {
        method: "POST",
        headers: {
          "x-cc-webhook-signature": "valid-signature",
        },
        body: createValidEnvelopeBody(),
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.received).toBe(true);
    expect(json.processed).toBe(true);
    expect(json.ignored).toBe(false);
    expect(json.details[0]).toContain("credited");
    expect(service.mocks.insertSingle).toHaveBeenCalled();
  });
});
