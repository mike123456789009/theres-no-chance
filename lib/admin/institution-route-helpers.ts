import type { SupabaseClient } from "@supabase/supabase-js";

import { jsonError, jsonInternalError } from "@/lib/api/http-errors";
import { parseJsonBody, serviceClientOrResponse, type RouteResult } from "@/lib/api/route-primitives";
import { isUuidLike } from "@/lib/admin/institutions-admin";
import { requireAllowlistedAdmin } from "@/lib/auth/admin-guard";

type AdminRouteAuth = {
  adminUser: {
    id: string;
    email: string | null;
  };
  service: SupabaseClient;
};

export async function requireInstitutionAdminService(error: string): Promise<RouteResult<AdminRouteAuth>> {
  const auth = await requireAllowlistedAdmin();
  if (!auth.ok) {
    return {
      ok: false,
      response: auth.response,
    };
  }

  const service = serviceClientOrResponse(error);
  if (!service.ok) {
    return service;
  }

  return {
    ok: true,
    value: {
      adminUser: auth.adminUser,
      service: service.value,
    },
  };
}

export async function parseAdminJsonBody<T>(request: Request): Promise<RouteResult<T>> {
  return parseJsonBody<T>(request);
}

export function requireUuid(value: string, label: string): RouteResult<string> {
  if (isUuidLike(value)) {
    return {
      ok: true,
      value,
    };
  }

  return {
    ok: false,
    response: jsonError(400, `Invalid ${label}.`),
  };
}

export function jsonAdminInternalError(error: string, cause: unknown, fallbackDetail: string) {
  return jsonInternalError(error, cause, fallbackDetail);
}
