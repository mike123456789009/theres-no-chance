import { requiredEnv } from "@/lib/env";

export type OpenAiResponse = {
  id?: string;
  status?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  output_text?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function extractOpenAiResponseText(response: OpenAiResponse): string {
  if (typeof response.output_text === "string" && response.output_text.trim().length > 0) {
    return response.output_text.trim();
  }

  const chunks: string[] = [];
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join("\n").trim();
}

export async function createOpenAiResponseWithRetry(
  payload: Record<string, unknown>,
  timeoutMs: number,
  maxAttempts = 2
): Promise<OpenAiResponse> {
  const key = requiredEnv("OPENAI_API_KEY");
  const attempts = Math.max(1, Math.min(4, Math.floor(maxAttempts)));
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const rawBody = await response.text();
      if (!response.ok) {
        throw new Error(`OpenAI response failed (${response.status}): ${rawBody.slice(0, 400)}`);
      }

      return JSON.parse(rawBody) as OpenAiResponse;
    } catch (error) {
      if (isOpenAiTimeoutLikeError(error)) {
        lastError = new Error(`OpenAI request timed out after ${timeoutMs}ms (attempt ${attempt}/${attempts}).`);
      } else {
        lastError = error instanceof Error ? error : new Error("Unknown OpenAI request error.");
      }
      if (attempt >= attempts) {
        throw lastError;
      }
      await sleep(450 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  throw lastError ?? new Error("OpenAI call failed with no error details.");
}

export function isOpenAiTimeoutLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const normalized = `${error.name} ${error.message}`.toLowerCase();
  return (
    normalized.includes("aborted") ||
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("aborterror")
  );
}

export function parseOpenAiResponseJson(response: OpenAiResponse, label: string): unknown {
  const text = extractOpenAiResponseText(response);
  if (!text) {
    throw new Error(`OpenAI returned empty content for ${label} response ${response.id ?? "unknown"}.`);
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Unable to parse ${label} structured output as JSON: ${
        error instanceof Error ? error.message : "unknown parse error"
      }. Raw: ${text.slice(0, 240)}.`
    );
  }
}
