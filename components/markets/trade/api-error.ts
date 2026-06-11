function cleanErrorText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function extractTradeApiError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as {
      detail?: unknown;
      error?: unknown;
      message?: unknown;
    };

    const detail = cleanErrorText(payload.detail);
    if (detail) return detail;

    const error = cleanErrorText(payload.error);
    if (error) return error;

    const message = cleanErrorText(payload.message);
    if (message) return message;
  } catch {
    return fallback;
  }

  return fallback;
}
