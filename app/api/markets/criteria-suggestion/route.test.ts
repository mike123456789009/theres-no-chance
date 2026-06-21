import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createOpenAiResponseWithRetry: vi.fn(),
  extractOpenAiResponseText: vi.fn(),
}));

vi.mock("@/lib/ai/openai-responses", () => ({
  createOpenAiResponseWithRetry: mocks.createOpenAiResponseWithRetry,
  extractOpenAiResponseText: mocks.extractOpenAiResponseText,
}));

import { createOpenAiResponseWithRetry, extractOpenAiResponseText } from "@/lib/ai/openai-responses";
import { createRouteRequest } from "@/lib/test-helpers/api-mocks";

import { POST } from "./route";

const CRITERIA_URL = "http://localhost/api/markets/criteria-suggestion";
const VALID_BODY = {
  question: "Will the campus library stay open after midnight during finals week?",
  description:
    "The market resolves based on official campus library hours posted for the spring finals week schedule.",
  closeTime: "2026-12-31T00:00:00.000Z",
  visibility: "unlisted",
};

function createCriteriaRequest(body: unknown = VALID_BODY) {
  return createRouteRequest(CRITERIA_URL, { body });
}

describe("POST /api/markets/criteria-suggestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createOpenAiResponseWithRetry).mockResolvedValue({ id: "criteria-response-1" });
    vi.mocked(extractOpenAiResponseText).mockReturnValue(
      JSON.stringify({
        resolvesYesIf: " Official library hours confirm the library stayed open after midnight. ",
        resolvesNoIf: "Official library hours do not confirm the library stayed open after midnight.",
      })
    );
  });

  it("rejects malformed JSON before invoking OpenAI", async () => {
    const response = await POST(
      new Request(CRITERIA_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "{bad json",
      })
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("Request body must be valid JSON.");
    expect(createOpenAiResponseWithRetry).not.toHaveBeenCalled();
    expect(extractOpenAiResponseText).not.toHaveBeenCalled();
  });

  it("returns validation details for missing basics before invoking OpenAI", async () => {
    const response = await POST(
      createCriteriaRequest({
        question: "Too short",
        description: "Too short",
        closeTime: "not-a-date",
      })
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({
      error: "Validation failed.",
      details: [
        "question must be at least 12 characters.",
        "description must be at least 30 characters.",
        "closeTime must be a valid date.",
      ],
    });
    expect(createOpenAiResponseWithRetry).not.toHaveBeenCalled();
    expect(extractOpenAiResponseText).not.toHaveBeenCalled();
  });

  it("sends sanitized basics to OpenAI and returns cleaned criteria", async () => {
    const response = await POST(
      createCriteriaRequest({
        question: "  Will the campus library stay open after midnight during finals week?  ",
        description:
          "  The market resolves based on official campus library hours posted for the spring finals week schedule.  ",
        closeTime: "  2026-12-31T00:00:00.000Z  ",
        visibility: " unlisted ",
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      criteria: {
        resolvesYesIf: "Official library hours confirm the library stayed open after midnight.",
        resolvesNoIf: "Official library hours do not confirm the library stayed open after midnight.",
      },
    });
    expect(createOpenAiResponseWithRetry).toHaveBeenCalledTimes(1);
    const [payload, timeoutMs, maxAttempts] = vi.mocked(createOpenAiResponseWithRetry).mock.calls[0];
    expect(timeoutMs).toBe(45_000);
    expect(maxAttempts).toBe(1);
    expect(payload).toEqual(
      expect.objectContaining({
        model: expect.any(String),
        text: {
          format: expect.objectContaining({
            type: "json_schema",
            name: "criteria_suggestion",
            strict: true,
          }),
        },
      })
    );
    const serializedPayload = JSON.stringify(payload);
    expect(serializedPayload).toContain("Will the campus library stay open after midnight during finals week?");
    expect(serializedPayload).toContain("Market visibility: unlisted");
    expect(serializedPayload).toContain("Market close time: 2026-12-31T00:00:00.000Z");
    expect(extractOpenAiResponseText).toHaveBeenCalledWith({ id: "criteria-response-1" });
  });

  it("returns 503 when the OpenAI response cannot be parsed into complete criteria", async () => {
    vi.mocked(extractOpenAiResponseText).mockReturnValueOnce(
      JSON.stringify({
        resolvesYesIf: "Too short",
        resolvesNoIf: "",
      })
    );

    const response = await POST(createCriteriaRequest());
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json).toEqual({
      error: "Unable to generate criteria suggestions right now.",
      detail: "Unable to parse criteria suggestion response.",
    });
  });

  it("returns 503 with OpenAI error detail when generation fails", async () => {
    vi.mocked(createOpenAiResponseWithRetry).mockRejectedValueOnce(new Error("OpenAI request timed out."));

    const response = await POST(createCriteriaRequest());
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json).toEqual({
      error: "Unable to generate criteria suggestions right now.",
      detail: "OpenAI request timed out.",
    });
  });
});
