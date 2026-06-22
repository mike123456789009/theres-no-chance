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

import { POST as addInstitutionDomain } from "./[institutionId]/domains/route";
import { GET as getInstitutionEmails } from "./[institutionId]/emails/route";
import { PATCH as renameInstitution } from "./[institutionId]/route";
import { PATCH as updateInstitutionDomain } from "./domains/[domainId]/route";
import { PATCH as updateInstitutionEmail } from "./emails/[institutionEmailId]/route";
import { POST as mergeInstitutions } from "./merge/route";
import { GET as listInstitutions } from "./route";

const ADMIN_USER = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "admin@example.edu",
};
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const TARGET_ORG_ID = "33333333-3333-4333-8333-333333333333";
const DOMAIN_ID = "44444444-4444-4444-8444-444444444444";
const EMAIL_ID = "55555555-5555-4555-8555-555555555555";

type DbError = {
  message: string;
  code?: string;
} | null;

type QueryResult = {
  data: unknown;
  error: DbError;
};

type QueryInput = {
  table: string;
  operation: "select" | "insert" | "update";
  filters: Record<string, unknown>;
  payload: unknown;
  limitValue: number | null;
  terminal: "await" | "single" | "maybeSingle";
};

type QueryResolver = (input: QueryInput) => Promise<QueryResult>;

class MockQuery {
  private operation: QueryInput["operation"] = "select";
  private filters: Record<string, unknown> = {};
  private payload: unknown = null;
  private limitValue: number | null = null;

  constructor(
    private table: string,
    private resolver: QueryResolver
  ) {}

  select() {
    return this;
  }

  order() {
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters[column] = value;
    return this;
  }

  insert(payload: unknown) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: unknown) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  async single() {
    return this.resolve("single");
  }

  async maybeSingle() {
    return this.resolve("maybeSingle");
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.resolve("await").then(onfulfilled, onrejected);
  }

  private resolve(terminal: QueryInput["terminal"]) {
    return this.resolver({
      table: this.table,
      operation: this.operation,
      filters: this.filters,
      payload: this.payload,
      limitValue: this.limitValue,
      terminal,
    });
  }
}

function createServiceMock(resolver: QueryResolver = defaultResolver) {
  const rpc = vi.fn<(name: string, args?: Record<string, unknown>) => Promise<QueryResult>>(async () => ({ data: null, error: null }));
  const client = {
    from: vi.fn((table: string) => new MockQuery(table, resolver)),
    rpc,
  };

  return {
    client,
    rpc,
  };
}

function asServiceClient(client: ReturnType<typeof createServiceMock>["client"]): ReturnType<typeof createServiceClient> {
  return client as unknown as ReturnType<typeof createServiceClient>;
}

function contextFor<T extends Record<string, string>>(params: T) {
  return {
    params: Promise.resolve(params),
  };
}

function institutionRequest(path: string, body?: unknown) {
  return createRouteRequest(`http://localhost${path}`, body === undefined ? { method: "GET" } : { body });
}

async function defaultResolver(input: QueryInput): Promise<QueryResult> {
  if (input.table === "admin_action_log" && input.operation === "insert") {
    return { data: null, error: null };
  }

  return { data: null, error: null };
}

describe("admin institution routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAllowlistedAdmin).mockResolvedValue({
      ok: true,
      adminUser: ADMIN_USER,
    });
    vi.mocked(isSupabaseServiceEnvConfigured).mockReturnValue(true);
    vi.mocked(getMissingSupabaseServiceEnv).mockReturnValue([]);
    vi.mocked(createServiceClient).mockReturnValue(asServiceClient(createServiceMock().client));
  });

  it("returns the admin guard response before checking service configuration", async () => {
    vi.mocked(requireAllowlistedAdmin).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 }),
    });

    const response = await listInstitutions();
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe("Forbidden.");
    expect(isSupabaseServiceEnvConfigured).not.toHaveBeenCalled();
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("returns 503 when service-role configuration is unavailable", async () => {
    vi.mocked(isSupabaseServiceEnvConfigured).mockReturnValue(false);
    vi.mocked(getMissingSupabaseServiceEnv).mockReturnValue(["SUPABASE_SERVICE_ROLE_KEY"]);

    const response = await renameInstitution(
      institutionRequest(`/api/admin/institutions/${ORG_ID}`, { name: "Alpha College" }),
      contextFor({ institutionId: ORG_ID })
    );
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error).toBe("Institution edit is unavailable: missing service role configuration.");
    expect(json.missingEnv).toEqual(["SUPABASE_SERVICE_ROLE_KEY"]);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("loads institution summaries with domains and membership/email counts", async () => {
    const service = createServiceMock(async ({ table }) => {
      if (table === "organizations") {
        return {
          data: [
            { id: ORG_ID, name: "Alpha College", slug: "alpha", created_at: "2026-02-01T00:00:00.000Z" },
            { id: TARGET_ORG_ID, name: "Beta University", slug: "beta", created_at: "2026-02-02T00:00:00.000Z" },
          ],
          error: null,
        };
      }

      if (table === "organization_domains") {
        return {
          data: [
            { id: DOMAIN_ID, organization_id: ORG_ID, domain: "alpha.edu", allow_subdomains: true },
            { id: "66666666-6666-4666-8666-666666666666", organization_id: TARGET_ORG_ID, domain: "beta.edu", allow_subdomains: false },
          ],
          error: null,
        };
      }

      if (table === "organization_memberships") {
        return {
          data: [
            { organization_id: ORG_ID, status: "active" },
            { organization_id: ORG_ID, status: "pending" },
            { organization_id: TARGET_ORG_ID, status: "active" },
          ],
          error: null,
        };
      }

      if (table === "user_institution_emails") {
        return {
          data: [
            { organization_id: ORG_ID, status: "verified" },
            { organization_id: ORG_ID, status: "pending_verification" },
            { organization_id: TARGET_ORG_ID, status: "revoked" },
          ],
          error: null,
        };
      }

      return defaultResolver({ table, operation: "select", filters: {}, payload: null, limitValue: null, terminal: "await" });
    });
    vi.mocked(createServiceClient).mockReturnValue(asServiceClient(service.client));

    const response = await listInstitutions();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.institutions).toEqual([
      {
        id: ORG_ID,
        name: "Alpha College",
        slug: "alpha",
        createdAt: "2026-02-01T00:00:00.000Z",
        domains: [{ id: DOMAIN_ID, organizationId: ORG_ID, domain: "alpha.edu", allowSubdomains: true }],
        counts: { activeMembers: 1, totalMembers: 2, verifiedEmails: 1, pendingEmails: 1 },
      },
      {
        id: TARGET_ORG_ID,
        name: "Beta University",
        slug: "beta",
        createdAt: "2026-02-02T00:00:00.000Z",
        domains: [
          {
            id: "66666666-6666-4666-8666-666666666666",
            organizationId: TARGET_ORG_ID,
            domain: "beta.edu",
            allowSubdomains: false,
          },
        ],
        counts: { activeMembers: 1, totalMembers: 1, verifiedEmails: 0, pendingEmails: 0 },
      },
    ]);
  });

  it("renames an institution with sanitized text and audit logging", async () => {
    const updates: QueryInput[] = [];
    const auditPayloads: unknown[] = [];
    const service = createServiceMock(async (input) => {
      if (input.table === "organizations" && input.operation === "update" && input.terminal === "single") {
        updates.push(input);
        return {
          data: { id: ORG_ID, name: "Alpha College", slug: "alpha" },
          error: null,
        };
      }

      if (input.table === "admin_action_log" && input.operation === "insert") {
        auditPayloads.push(input.payload);
        return { data: null, error: null };
      }

      return defaultResolver(input);
    });
    vi.mocked(createServiceClient).mockReturnValue(asServiceClient(service.client));

    const response = await renameInstitution(
      institutionRequest(`/api/admin/institutions/${ORG_ID}`, { name: "  Alpha\n   College  " }),
      contextFor({ institutionId: ORG_ID })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.message).toBe("Institution renamed.");
    expect(updates[0]?.payload).toEqual({ name: "Alpha College" });
    expect(updates[0]?.filters).toEqual({ id: ORG_ID });
    expect(auditPayloads[0]).toMatchObject({
      admin_user_id: ADMIN_USER.id,
      action: "rename_institution",
      target_type: "organization",
      target_id: ORG_ID,
      details: {
        institutionId: ORG_ID,
        updatedName: "Alpha College",
      },
    });
  });

  it("adds a normalized institution domain and records an audit log", async () => {
    const inserts: QueryInput[] = [];
    const auditPayloads: unknown[] = [];
    const service = createServiceMock(async (input) => {
      if (input.table === "organization_domains" && input.operation === "insert" && input.terminal === "single") {
        inserts.push(input);
        return {
          data: {
            id: DOMAIN_ID,
            organization_id: ORG_ID,
            domain: "students.alpha.edu",
            allow_subdomains: false,
          },
          error: null,
        };
      }

      if (input.table === "admin_action_log" && input.operation === "insert") {
        auditPayloads.push(input.payload);
        return { data: null, error: null };
      }

      return defaultResolver(input);
    });
    vi.mocked(createServiceClient).mockReturnValue(asServiceClient(service.client));

    const response = await addInstitutionDomain(
      institutionRequest(`/api/admin/institutions/${ORG_ID}/domains`, {
        domain: " Students.Alpha.EDU ",
        allowSubdomains: false,
      }),
      contextFor({ institutionId: ORG_ID })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.message).toBe("Institution domain added.");
    expect(inserts[0]?.payload).toEqual({
      organization_id: ORG_ID,
      domain: "students.alpha.edu",
      allow_subdomains: false,
    });
    expect(auditPayloads[0]).toMatchObject({
      admin_user_id: ADMIN_USER.id,
      action: "add_institution_domain",
      target_type: "organization_domain",
      target_id: DOMAIN_ID,
      details: {
        institutionId: ORG_ID,
        domain: "students.alpha.edu",
        allowSubdomains: false,
      },
    });
  });

  it("rejects invalid domain creates and reports duplicate domains mapped elsewhere", async () => {
    const invalidResponse = await addInstitutionDomain(
      institutionRequest(`/api/admin/institutions/${ORG_ID}/domains`, { domain: "alpha.com" }),
      contextFor({ institutionId: ORG_ID })
    );
    const invalidJson = await invalidResponse.json();

    expect(invalidResponse.status).toBe(400);
    expect(invalidJson.error).toBe("Domain must be a valid .edu domain.");

    const service = createServiceMock(async (input) => {
      if (input.table === "organization_domains" && input.operation === "insert" && input.terminal === "single") {
        return { data: null, error: { code: "23505", message: "duplicate key" } };
      }

      if (input.table === "organization_domains" && input.operation === "select" && input.terminal === "maybeSingle") {
        return {
          data: {
            id: DOMAIN_ID,
            organization_id: TARGET_ORG_ID,
            domain: "alpha.edu",
            allow_subdomains: true,
          },
          error: null,
        };
      }

      return defaultResolver(input);
    });
    vi.mocked(createServiceClient).mockReturnValue(asServiceClient(service.client));

    const duplicateResponse = await addInstitutionDomain(
      institutionRequest(`/api/admin/institutions/${ORG_ID}/domains`, { domain: "alpha.edu" }),
      contextFor({ institutionId: ORG_ID })
    );
    const duplicateJson = await duplicateResponse.json();

    expect(duplicateResponse.status).toBe(409);
    expect(duplicateJson.error).toBe("Domain is already mapped to another institution.");
    expect(duplicateJson.existingOrganizationId).toBe(TARGET_ORG_ID);
  });

  it("edits and reassigns an institution domain with audit context", async () => {
    const updates: QueryInput[] = [];
    const auditPayloads: unknown[] = [];
    const service = createServiceMock(async (input) => {
      if (input.table === "organization_domains" && input.operation === "select" && input.terminal === "maybeSingle") {
        return {
          data: {
            id: DOMAIN_ID,
            organization_id: ORG_ID,
            domain: "alpha.edu",
            allow_subdomains: true,
          },
          error: null,
        };
      }

      if (input.table === "organization_domains" && input.operation === "update" && input.terminal === "single") {
        updates.push(input);
        return {
          data: {
            id: DOMAIN_ID,
            organization_id: TARGET_ORG_ID,
            domain: "students.alpha.edu",
            allow_subdomains: false,
          },
          error: null,
        };
      }

      if (input.table === "admin_action_log" && input.operation === "insert") {
        auditPayloads.push(input.payload);
        return { data: null, error: null };
      }

      return defaultResolver(input);
    });
    vi.mocked(createServiceClient).mockReturnValue(asServiceClient(service.client));

    const response = await updateInstitutionDomain(
      institutionRequest(`/api/admin/institutions/domains/${DOMAIN_ID}`, {
        domain: " Students.Alpha.EDU ",
        allowSubdomains: false,
        organizationId: TARGET_ORG_ID,
      }),
      contextFor({ domainId: DOMAIN_ID })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.message).toBe("Domain mapping updated.");
    expect(updates[0]?.payload).toEqual({
      domain: "students.alpha.edu",
      allow_subdomains: false,
      organization_id: TARGET_ORG_ID,
    });
    expect(updates[0]?.filters).toEqual({ id: DOMAIN_ID });
    expect(auditPayloads[0]).toMatchObject({
      action: "edit_institution_domain",
      target_type: "organization_domain",
      target_id: DOMAIN_ID,
      details: {
        before: {
          id: DOMAIN_ID,
          organization_id: ORG_ID,
          domain: "alpha.edu",
          allow_subdomains: true,
        },
        after: {
          id: DOMAIN_ID,
          organization_id: TARGET_ORG_ID,
          domain: "students.alpha.edu",
          allow_subdomains: false,
        },
      },
    });
  });

  it("updates an institution email identity with normalized email, status, and verified timestamp", async () => {
    const updates: QueryInput[] = [];
    const auditPayloads: unknown[] = [];
    const service = createServiceMock(async (input) => {
      if (input.table === "user_institution_emails" && input.operation === "select" && input.terminal === "maybeSingle") {
        return {
          data: {
            id: EMAIL_ID,
            email: "old@alpha.edu",
            domain: "alpha.edu",
            organization_id: ORG_ID,
            status: "pending_verification",
            verified_at: null,
          },
          error: null,
        };
      }

      if (input.table === "user_institution_emails" && input.operation === "update" && input.terminal === "single") {
        updates.push(input);
        return {
          data: {
            id: EMAIL_ID,
            user_id: "user-1",
            email: "member@alpha.edu",
            domain: "alpha.edu",
            organization_id: TARGET_ORG_ID,
            status: "verified",
            verified_at: "2026-06-21T00:00:00.000Z",
            created_at: "2026-02-01T00:00:00.000Z",
            updated_at: "2026-06-21T00:00:00.000Z",
          },
          error: null,
        };
      }

      if (input.table === "admin_action_log" && input.operation === "insert") {
        auditPayloads.push(input.payload);
        return { data: null, error: null };
      }

      return defaultResolver(input);
    });
    vi.mocked(createServiceClient).mockReturnValue(asServiceClient(service.client));

    const response = await updateInstitutionEmail(
      institutionRequest(`/api/admin/institutions/emails/${EMAIL_ID}`, {
        email: " Member@Alpha.EDU ",
        organizationId: TARGET_ORG_ID,
        status: "verified",
      }),
      contextFor({ institutionEmailId: EMAIL_ID })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.message).toBe("Institution email identity updated.");
    expect(updates[0]?.payload).toEqual({
      email: "member@alpha.edu",
      domain: "alpha.edu",
      organization_id: TARGET_ORG_ID,
      status: "verified",
      verified_at: expect.any(String),
    });
    expect(auditPayloads[0]).toMatchObject({
      action: "edit_institution_email_identity",
      target_type: "institution_email_identity",
      target_id: EMAIL_ID,
      details: {
        before: {
          id: EMAIL_ID,
          email: "old@alpha.edu",
          domain: "alpha.edu",
          organization_id: ORG_ID,
          status: "pending_verification",
          verified_at: null,
        },
      },
    });
  });

  it("rejects non-edu institution email updates", async () => {
    const response = await updateInstitutionEmail(
      institutionRequest(`/api/admin/institutions/emails/${EMAIL_ID}`, { email: "member@example.com" }),
      contextFor({ institutionEmailId: EMAIL_ID })
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("Institution email must use a .edu domain.");
  });

  it("loads institution email identities with clamped limits", async () => {
    const service = createServiceMock(async (input) => {
      if (input.table === "user_institution_emails" && input.operation === "select") {
        expect(input.filters).toEqual({ organization_id: ORG_ID });
        expect(input.limitValue).toBe(1000);
        return {
          data: [
            {
              id: EMAIL_ID,
              user_id: "user-1",
              email: "member@alpha.edu",
              domain: "alpha.edu",
              organization_id: ORG_ID,
              status: "verified",
              verified_at: "2026-02-01T00:00:00.000Z",
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-02-01T00:00:00.000Z",
            },
          ],
          error: null,
        };
      }

      return defaultResolver(input);
    });
    vi.mocked(createServiceClient).mockReturnValue(asServiceClient(service.client));

    const response = await getInstitutionEmails(
      new Request(`http://localhost/api/admin/institutions/${ORG_ID}/emails?limit=2000`),
      contextFor({ institutionId: ORG_ID })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.identities).toEqual([
      {
        id: EMAIL_ID,
        userId: "user-1",
        email: "member@alpha.edu",
        domain: "alpha.edu",
        organizationId: ORG_ID,
        status: "verified",
        verifiedAt: "2026-02-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-02-01T00:00:00.000Z",
      },
    ]);
  });

  it("merges two institutions through the admin RPC and maps bracketed RPC errors", async () => {
    const service = createServiceMock();
    service.rpc.mockResolvedValueOnce({ data: { movedDomains: 2 }, error: null });
    vi.mocked(createServiceClient).mockReturnValue(asServiceClient(service.client));

    const successResponse = await mergeInstitutions(
      institutionRequest("/api/admin/institutions/merge", {
        sourceOrganizationId: ORG_ID,
        targetOrganizationId: TARGET_ORG_ID,
        deleteSource: false,
      })
    );
    const successJson = await successResponse.json();

    expect(successResponse.status).toBe(200);
    expect(successJson).toEqual({
      message: "Institution merge completed.",
      result: { movedDomains: 2 },
    });
    expect(service.rpc).toHaveBeenCalledWith("admin_merge_institutions", {
      p_admin_user_id: ADMIN_USER.id,
      p_source_organization_id: ORG_ID,
      p_target_organization_id: TARGET_ORG_ID,
      p_delete_source: false,
    });

    service.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "[INST_NOT_FOUND] source institution missing" },
    });

    const failureResponse = await mergeInstitutions(
      institutionRequest("/api/admin/institutions/merge", {
        sourceOrganizationId: ORG_ID,
        targetOrganizationId: TARGET_ORG_ID,
      })
    );
    const failureJson = await failureResponse.json();

    expect(failureResponse.status).toBe(404);
    expect(failureJson).toEqual({
      error: "Institution not found.",
      detail: "source institution missing",
    });
  });

  it("rejects invalid merge identifiers before invoking the RPC", async () => {
    const service = createServiceMock();
    vi.mocked(createServiceClient).mockReturnValue(asServiceClient(service.client));

    const response = await mergeInstitutions(
      institutionRequest("/api/admin/institutions/merge", {
        sourceOrganizationId: ORG_ID,
        targetOrganizationId: ORG_ID,
      })
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("Source and target institutions must differ.");
    expect(service.rpc).not.toHaveBeenCalled();
  });
});
