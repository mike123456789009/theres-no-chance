import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isSupabaseServerEnvConfigured: vi.fn(),
  getMissingSupabaseServerEnv: vi.fn(),
  createClient: vi.fn(),
  getMissingSupabaseServiceEnv: vi.fn(),
  checkUserAdminAccess: vi.fn(),
  getAdminAllowlistEmails: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  isSupabaseServerEnvConfigured: mocks.isSupabaseServerEnvConfigured,
  getMissingSupabaseServerEnv: mocks.getMissingSupabaseServerEnv,
  createClient: mocks.createClient,
}));

vi.mock("@/lib/supabase/service", () => ({
  getMissingSupabaseServiceEnv: mocks.getMissingSupabaseServiceEnv,
}));

vi.mock("@/lib/auth/admin", () => ({
  checkUserAdminAccess: mocks.checkUserAdminAccess,
  getAdminAllowlistEmails: mocks.getAdminAllowlistEmails,
}));

import { guardAdminPageAccess } from "./access";

describe("guardAdminPageAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMissingSupabaseServerEnv.mockReturnValue(["SUPABASE_URL"]);
    mocks.getMissingSupabaseServiceEnv.mockReturnValue(["SUPABASE_SERVICE_ROLE_KEY"]);
    mocks.getAdminAllowlistEmails.mockReturnValue(["admin@example.edu"]);
  });

  it("returns missing_server_env when server env is not configured", async () => {
    mocks.isSupabaseServerEnvConfigured.mockReturnValue(false);

    await expect(guardAdminPageAccess()).resolves.toEqual({
      ok: false,
      reason: "missing_server_env",
      missingEnv: ["SUPABASE_URL"],
    });
  });

  it("returns unauthenticated when no signed-in user exists", async () => {
    mocks.isSupabaseServerEnvConfigured.mockReturnValue(true);
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    });

    await expect(guardAdminPageAccess()).resolves.toEqual({
      ok: false,
      reason: "unauthenticated",
    });
  });

  it("returns missing_service_env when role checks are unavailable", async () => {
    mocks.isSupabaseServerEnvConfigured.mockReturnValue(true);
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "user-1",
              email: "admin@example.edu",
            },
          },
          error: null,
        }),
      },
    });
    mocks.checkUserAdminAccess.mockResolvedValue({
      isAdmin: false,
      roleCheckUnavailable: true,
    });

    await expect(guardAdminPageAccess()).resolves.toEqual({
      ok: false,
      reason: "missing_service_env",
      email: "admin@example.edu",
      allowlist: ["admin@example.edu"],
      missingEnv: ["SUPABASE_SERVICE_ROLE_KEY"],
    });
  });

  it("returns ok true for an authorized admin", async () => {
    mocks.isSupabaseServerEnvConfigured.mockReturnValue(true);
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "user-2",
              email: "owner@example.edu",
            },
          },
          error: null,
        }),
      },
    });
    mocks.checkUserAdminAccess.mockResolvedValue({
      isAdmin: true,
      roleCheckUnavailable: false,
    });

    await expect(guardAdminPageAccess()).resolves.toEqual({
      ok: true,
      adminUser: {
        id: "user-2",
        email: "owner@example.edu",
      },
      allowlist: ["admin@example.edu"],
    });
  });
});
