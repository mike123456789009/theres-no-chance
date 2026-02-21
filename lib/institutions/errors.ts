function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isUniqueViolation(error: { code?: string; message?: string } | null | undefined): boolean {
  return error?.code === "23505" || clean(error?.message).toLowerCase().includes("duplicate key");
}

export function mapInstitutionVerificationRpcError(message: string): { status: number; error: string; detail: string } {
  const trimmed = clean(message);
  const match = trimmed.match(/^\[(INST_[A-Z_]+)\]\s*(.*)$/);
  if (!match) {
    return {
      status: 500,
      error: "Institution verification failed.",
      detail: trimmed || "Unknown institution verification error.",
    };
  }

  const code = match[1];
  const detail = clean(match[2]) || "Institution verification failed.";

  if (code === "INST_VALIDATION") {
    return { status: 400, error: "Institution verification validation failed.", detail };
  }

  if (code === "INST_FORBIDDEN") {
    return { status: 403, error: "Institution verification forbidden.", detail };
  }

  if (code === "INST_NOT_FOUND") {
    return { status: 404, error: "Institution verification challenge not found.", detail };
  }

  if (code === "INST_EXPIRED") {
    return { status: 410, error: "Institution verification challenge expired.", detail };
  }

  if (code === "INST_INVALID_CODE") {
    return { status: 400, error: "Invalid institution verification code.", detail };
  }

  if (code === "INST_TOO_MANY_ATTEMPTS") {
    return { status: 429, error: "Too many institution verification attempts.", detail };
  }

  if (code === "INST_CONFLICT") {
    return { status: 409, error: "Institution verification challenge conflict.", detail };
  }

  return {
    status: 500,
    error: "Institution verification failed.",
    detail,
  };
}
