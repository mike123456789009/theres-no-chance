import { NextResponse } from "next/server";

import { jsonEnvUnavailable, jsonError } from "@/lib/api/http-errors";
import { uniqueValues } from "@/lib/shared/primitives";
import { createClient, getMissingSupabaseServerEnv, isSupabaseServerEnvConfigured } from "@/lib/supabase/server";
import { createServiceClient, getMissingSupabaseServiceEnv, isSupabaseServiceEnvConfigured } from "@/lib/supabase/service";

export type RouteResult<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

export async function parseJsonBody<T = unknown>(
  request: Request,
  error = "Request body must be valid JSON."
): Promise<RouteResult<T>> {
  try {
    return {
      ok: true,
      value: (await request.json()) as T,
    };
  } catch {
    return {
      ok: false,
      response: jsonError(400, error),
    };
  }
}

export function mergeMissingEnv(...missingEnvGroups: readonly string[][]): string[] {
  return uniqueValues(missingEnvGroups.flat());
}

export function requireServerEnv(error: string): RouteResult<true> {
  if (isSupabaseServerEnvConfigured()) {
    return { ok: true, value: true };
  }

  return {
    ok: false,
    response: jsonEnvUnavailable(error, getMissingSupabaseServerEnv()),
  };
}

export function requireServiceEnv(error: string): RouteResult<true> {
  if (isSupabaseServiceEnvConfigured()) {
    return { ok: true, value: true };
  }

  return {
    ok: false,
    response: jsonEnvUnavailable(error, getMissingSupabaseServiceEnv()),
  };
}

export function requireServerAndServiceEnv(error: string): RouteResult<true> {
  const serverMissing = getMissingSupabaseServerEnv();
  const serviceMissing = getMissingSupabaseServiceEnv();
  if (serverMissing.length === 0 && serviceMissing.length === 0) {
    return { ok: true, value: true };
  }

  return {
    ok: false,
    response: jsonEnvUnavailable(error, mergeMissingEnv(serverMissing, serviceMissing)),
  };
}

export async function requireAuthenticatedUser(error = "Unauthorized."): Promise<
  RouteResult<{
    id: string;
    email: string | null;
  }>
> {
  const env = requireServerEnv("Authentication unavailable: missing Supabase environment variables.");
  if (!env.ok) {
    return env;
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      response: jsonError(401, error),
    };
  }

  return {
    ok: true,
    value: {
      id: user.id,
      email: user.email ?? null,
    },
  };
}

export function serviceClientOrResponse(error: string): RouteResult<ReturnType<typeof createServiceClient>> {
  const env = requireServiceEnv(error);
  if (!env.ok) {
    return env;
  }

  return {
    ok: true,
    value: createServiceClient(),
  };
}
