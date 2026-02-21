import { NextResponse } from "next/server";

type ErrorExtras = {
  detail?: string;
  details?: unknown;
  code?: string;
  missingEnv?: string[];
};

export function jsonError(status: number, error: string, extras: ErrorExtras = {}) {
  return NextResponse.json(
    {
      error,
      ...extras,
    },
    { status }
  );
}

export function jsonEnvUnavailable(error: string, missingEnv: string[]) {
  return jsonError(503, error, { missingEnv });
}

export function jsonUnauthorized(error = "Unauthorized.") {
  return jsonError(401, error);
}

export function jsonInternalError(error: string, cause: unknown, fallbackDetail = "Unknown server error.") {
  return jsonError(500, error, {
    detail: cause instanceof Error ? cause.message : fallbackDetail,
  });
}
