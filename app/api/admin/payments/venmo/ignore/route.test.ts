import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/admin-guard", () => ({
  requireAllowlistedAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(),
  isSupabaseServiceEnvConfigured: vi.fn(() => true),
  getMissingSupabaseServiceEnv: vi.fn(() => []),
}));

import { requireAllowlistedAdmin } from "@/lib/auth/admin-guard";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";
import { createRouteRequest } from "@/lib/test-helpers/api-mocks";

import { POST } from "./route";

const IGNORE_URL = "http://localhost/api/admin/payments/venmo/ignore";
const ADMIN_USER = {
  id: "admin-user-1",
  email: "admin@example.edu",
};

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

type QueryInput = {
  table: string;
  operation: "update";
  filters: Record<string, unknown>;
  payload: Record<string, unknown> | null;
  terminal: "maybeSingle";
};

class MockIgnoreQuery {
  private filters: Record<string, unknown> = {};
  private payload: Record<string, unknown> | null = null;

  constructor(private result: QueryResult) {}

  update(payload: Record<string, unknown>) {
    this.payload = payload;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters[column] = value;
    return this;
  }

  select() {
    return this;
  }

  async maybeSingle() {
    return this.result;
  }

  getInput(): QueryInput {
    return {
      table: "venmo_incoming_payments",
      operation: "update",
      filters: this.filters,
      payload: this.payload,
      terminal: "maybeSingle",
    };
  }
}

function createIgnoreRequest(body: unknown = { incomingPaymentId: "incoming-1" }) {
  return createRouteRequest(IGNORE_URL, { body });
}

function asServiceClient(client: ReturnType<typeof createIgnoreServiceMock>["client"]): ReturnType<typeof createServiceClient> {
  return client as unknown as ReturnType<typeof createServiceClient>;
}

function createIgnoreServiceMock(options: {
  data?: unknown;
  error?: { message: string } | null;
} = {}) {
  const query = new MockIgnoreQuery({
    data: options.data === undefined ? { id: "incoming-1" } : options.data,
    error: options.error ?? null,
  });

  return {
    client: {
      from: vi.fn((table: string) => {
        if (table !== "venmo_incoming_payments") throw new Error(`Unexpected table ${table}`);
        return query;
      }),
    },
    query,
  };
}

describe("POST /api/admin/payments/venmo/ignore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAllowlistedAdmin).mockResolvedValue({
      ok: true,
      adminUser: ADMIN_USER,
    });
    vi.mocked(isSupabaseServiceEnvConfigured).mockReturnValue(true);
    vi.mocked(getMissingSupabaseServiceEnv).mockReturnValue([]);
    vi.mocked(createServiceClient).mockReturnValue(asServiceClient(createIgnoreServiceMock().client));
  });

  it("returns the admin guard response before checking service configuration", async () => {
    vi.mocked(requireAllowlistedAdmin).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    });

    const response = await POST(createIgnoreRequest());
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe("Forbidden.");
    expect(isSupabaseServiceEnvConfigured).not.toHaveBeenCalled();
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("returns 503 when service-role configuration is unavailable", async () => {
    vi.mocked(isSupabaseServiceEnvConfigured).mockReturnValue(false);
    vi.mocked(getMissingSupabaseServiceEnv).mockReturnValue(["SUPABASE_SERVICE_ROLE_KEY"]);

    const response = await POST(createIgnoreRequest());
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error).toBe("Venmo ignore action unavailable: missing service environment variables.");
    expect(json.missingEnv).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and missing incoming ids before updating rows", async () => {
    const malformedResponse = await POST(
      new Request(IGNORE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "{bad json",
      })
    );
    const malformedJson = await malformedResponse.json();

    expect(malformedResponse.status).toBe(400);
    expect(malformedJson.error).toBe("Request body must be valid JSON.");

    const missingResponse = await POST(createIgnoreRequest({ incomingPaymentId: " " }));
    const missingJson = await missingResponse.json();

    expect(missingResponse.status).toBe(400);
    expect(missingJson.error).toBe("incomingPaymentId is required.");
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("returns 404 when the incoming payment cannot be updated", async () => {
    const service = createIgnoreServiceMock({ data: null });
    vi.mocked(createServiceClient).mockReturnValue(asServiceClient(service.client));

    const response = await POST(createIgnoreRequest());
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toBe("Incoming payment row not found or could not be updated.");
  });

  it("marks an incoming payment ignored with a custom reason", async () => {
    const service = createIgnoreServiceMock();
    vi.mocked(createServiceClient).mockReturnValue(asServiceClient(service.client));

    const response = await POST(createIgnoreRequest({ incomingPaymentId: " incoming-1 ", reason: " duplicate transfer " }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.message).toBe("Incoming Venmo payment marked ignored.");
    expect(json.incomingPaymentId).toBe("incoming-1");
    expect(service.query.getInput()).toMatchObject({
      filters: {
        id: "incoming-1",
      },
      payload: {
        match_status: "ignored",
        error_message: "duplicate transfer",
      },
    });
  });

  it("uses a bounded default reason when no reason is supplied", async () => {
    const service = createIgnoreServiceMock();
    vi.mocked(createServiceClient).mockReturnValue(asServiceClient(service.client));

    const response = await POST(createIgnoreRequest({ incomingPaymentId: "incoming-1" }));

    expect(response.status).toBe(200);
    expect(service.query.getInput().payload).toMatchObject({
      match_status: "ignored",
      error_message: `Ignored by admin ${ADMIN_USER.id}`,
    });
  });
});
