import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/admin-guard", () => ({
  requireAllowlistedAdmin: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
  checkUserAdminAccess: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(),
  isSupabaseServiceEnvConfigured: vi.fn(() => true),
  getMissingSupabaseServiceEnv: vi.fn(() => []),
}));

import { checkUserAdminAccess } from "@/lib/auth/admin";
import { requireAllowlistedAdmin } from "@/lib/auth/admin-guard";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";
import { createRouteRequest } from "@/lib/test-helpers/api-mocks";

import { POST } from "./route";

const TARGET_USER_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_EMAIL = "student@example.edu";
const ADMIN_USER = {
  id: "admin-user-1",
  email: "admin@example.edu",
};

type InsertError = {
  code?: string;
  message: string;
};

function createGrantRequest(body: unknown = validBody()) {
  return createRouteRequest(`http://localhost/api/admin/users/${TARGET_USER_ID}/grant-platform-admin`, { body });
}

function createContext(userId = TARGET_USER_ID) {
  return {
    params: Promise.resolve({ userId }),
  };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    confirmIntent: "grant_platform_admin",
    confirmAcknowledge: true,
    confirmTargetEmail: TARGET_EMAIL,
    confirmPhrase: "GRANT ADMIN",
    ...overrides,
  };
}

function createServiceMock(options: {
  targetUser?: { id: string; email?: string | null } | null;
  targetUserError?: { message: string } | null;
  roleInsertError?: InsertError | null;
  auditInsertError?: InsertError | null;
} = {}) {
  const roleInsert = vi.fn(async () => ({
    error: options.roleInsertError ?? null,
  }));
  const auditInsert = vi.fn(async () => ({
    error: options.auditInsertError ?? null,
  }));
  const getUserById = vi.fn(async () => ({
    data: options.targetUserError
      ? null
      : {
          user: options.targetUser === undefined ? { id: TARGET_USER_ID, email: TARGET_EMAIL } : options.targetUser,
        },
    error: options.targetUserError ?? null,
  }));
  const from = vi.fn((table: string) => {
    if (table === "user_roles") {
      return { insert: roleInsert };
    }
    if (table === "admin_action_log") {
      return { insert: auditInsert };
    }
    throw new Error(`Unexpected table ${table}`);
  });

  return {
    client: {
      auth: {
        admin: {
          getUserById,
        },
      },
      from,
    },
    getUserById,
    roleInsert,
    auditInsert,
    from,
  };
}

function asServiceClient(client: ReturnType<typeof createServiceMock>["client"]): ReturnType<typeof createServiceClient> {
  return client as unknown as ReturnType<typeof createServiceClient>;
}

describe("POST /api/admin/users/[userId]/grant-platform-admin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAllowlistedAdmin).mockResolvedValue({
      ok: true,
      adminUser: ADMIN_USER,
    });
    vi.mocked(isSupabaseServiceEnvConfigured).mockReturnValue(true);
    vi.mocked(getMissingSupabaseServiceEnv).mockReturnValue([]);
    vi.mocked(checkUserAdminAccess).mockResolvedValue({
      isAdmin: false,
      source: "none",
      roleCheckUnavailable: false,
      errorMessage: "",
    });
    vi.mocked(createServiceClient).mockReturnValue(asServiceClient(createServiceMock().client));
  });

  it("returns the admin guard response before touching service-role state", async () => {
    vi.mocked(requireAllowlistedAdmin).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    });

    const response = await POST(createGrantRequest(), createContext());
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe("Forbidden.");
    expect(isSupabaseServiceEnvConfigured).not.toHaveBeenCalled();
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("returns 503 when service-role configuration is unavailable", async () => {
    vi.mocked(isSupabaseServiceEnvConfigured).mockReturnValue(false);
    vi.mocked(getMissingSupabaseServiceEnv).mockReturnValue(["SUPABASE_SERVICE_ROLE_KEY"]);

    const response = await POST(createGrantRequest(), createContext());
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error).toBe("Admin role management unavailable: missing service role configuration.");
    expect(json.missingEnv).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("rejects invalid user ids before parsing confirmation payloads", async () => {
    const response = await POST(createGrantRequest(), createContext("not-a-user-id"));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("Invalid user id.");
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON bodies", async () => {
    const request = new Request(`http://localhost/api/admin/users/${TARGET_USER_ID}/grant-platform-admin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: "{bad json",
    });

    const response = await POST(request, createContext());
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("Request body must be valid JSON.");
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it.each([
    {
      body: validBody({ confirmIntent: "grant-admin" }),
      error: "Confirmation intent missing or invalid.",
    },
    {
      body: validBody({ confirmAcknowledge: false }),
      error: "Risk acknowledgement is required.",
    },
    {
      body: validBody({ confirmPhrase: "grant admin" }),
      error: "Confirmation phrase must exactly match GRANT ADMIN.",
    },
  ])("rejects invalid server-side confirmation: $error", async ({ body, error }) => {
    const response = await POST(createGrantRequest(body), createContext());
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe(error);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("rejects missing target users", async () => {
    const service = createServiceMock({
      targetUser: null,
    });
    vi.mocked(createServiceClient).mockReturnValue(asServiceClient(service.client));

    const response = await POST(createGrantRequest(), createContext());
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toBe("Target user was not found.");
    expect(service.roleInsert).not.toHaveBeenCalled();
  });

  it("rejects targets without a usable email", async () => {
    const service = createServiceMock({
      targetUser: {
        id: TARGET_USER_ID,
        email: null,
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(asServiceClient(service.client));

    const response = await POST(createGrantRequest(), createContext());
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("Target user does not have a usable email.");
    expect(service.roleInsert).not.toHaveBeenCalled();
  });

  it("requires the confirmation email to match the selected target user", async () => {
    const service = createServiceMock();
    vi.mocked(createServiceClient).mockReturnValue(asServiceClient(service.client));

    const response = await POST(createGrantRequest(validBody({ confirmTargetEmail: "other@example.edu" })), createContext());
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("Confirmation email does not match the selected user.");
    expect(service.roleInsert).not.toHaveBeenCalled();
  });

  it("returns already_admin without inserting when the target already has admin access", async () => {
    const service = createServiceMock();
    vi.mocked(createServiceClient).mockReturnValue(asServiceClient(service.client));
    vi.mocked(checkUserAdminAccess).mockResolvedValue({
      isAdmin: true,
      source: "role",
      roleCheckUnavailable: false,
      errorMessage: "",
    });

    const response = await POST(createGrantRequest(validBody({ confirmTargetEmail: " Student@Example.edu " })), createContext());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe("already_admin");
    expect(json.user.email).toBe(TARGET_EMAIL);
    expect(service.roleInsert).not.toHaveBeenCalled();
  });

  it("maps duplicate role inserts to an idempotent already_admin response", async () => {
    const service = createServiceMock({
      roleInsertError: {
        code: "23505",
        message: "duplicate key value violates unique constraint",
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(asServiceClient(service.client));

    const response = await POST(createGrantRequest(), createContext());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe("already_admin");
    expect(service.auditInsert).not.toHaveBeenCalled();
  });

  it("returns 500 when the platform-admin role insert fails", async () => {
    const service = createServiceMock({
      roleInsertError: {
        code: "42501",
        message: "permission denied for table user_roles",
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(asServiceClient(service.client));

    const response = await POST(createGrantRequest(), createContext());
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe("Unable to grant platform admin role.");
    expect(json.detail).toBe("permission denied for table user_roles");
    expect(service.auditInsert).not.toHaveBeenCalled();
  });

  it("grants platform admin access and writes an audit entry", async () => {
    const service = createServiceMock();
    vi.mocked(createServiceClient).mockReturnValue(asServiceClient(service.client));

    const response = await POST(createGrantRequest(validBody({ confirmAcknowledge: "true" })), createContext());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe("granted");
    expect(json.auditLogged).toBe(true);
    expect(service.getUserById).toHaveBeenCalledWith(TARGET_USER_ID);
    expect(service.roleInsert).toHaveBeenCalledWith({
      user_id: TARGET_USER_ID,
      role: "platform_admin",
      organization_id: null,
    });
    expect(service.auditInsert).toHaveBeenCalledWith({
      admin_user_id: ADMIN_USER.id,
      action: "grant_platform_admin",
      target_type: "user",
      target_id: TARGET_USER_ID,
      details: {
        grantedByEmail: ADMIN_USER.email,
        grantedToEmail: TARGET_EMAIL,
      },
    });
  });

  it("still grants access when audit logging fails and returns an audit warning", async () => {
    const service = createServiceMock({
      auditInsertError: {
        message: "audit insert failed",
      },
    });
    vi.mocked(createServiceClient).mockReturnValue(asServiceClient(service.client));

    const response = await POST(createGrantRequest(), createContext());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe("granted");
    expect(json.auditLogged).toBe(false);
    expect(json.auditWarning).toBe("audit insert failed");
  });
});
