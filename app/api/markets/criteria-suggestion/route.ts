import { NextResponse } from "next/server";

import { createOpenAiResponseWithRetry, extractOpenAiResponseText } from "@/lib/ai/openai-responses";
import { jsonError } from "@/lib/api/http-errors";
import { parseJsonBody } from "@/lib/api/route-primitives";
import { cleanText as cleanTextPrimitive } from "@/lib/shared/primitives";

type CriteriaSuggestionBody = {
  question?: unknown;
  description?: unknown;
  closeTime?: unknown;
  visibility?: unknown;
};

const DEFAULT_MODEL = process.env.MARKET_CRITERIA_MODEL?.trim() || "gpt-5-mini";
const CRITERIA_OPENAI_TIMEOUT_MS = 45_000;

function cleanText(value: unknown, maxLength: number): string {
  return cleanTextPrimitive(value, maxLength).replace(/\s+/g, " ");
}

function parseCriteriaJson(raw: string): { resolvesYesIf: string; resolvesNoIf: string } | null {
  try {
    const parsed = JSON.parse(raw) as {
      resolvesYesIf?: unknown;
      resolvesNoIf?: unknown;
    };

    const resolvesYesIf = cleanText(parsed.resolvesYesIf, 1500);
    const resolvesNoIf = cleanText(parsed.resolvesNoIf, 1500);

    if (resolvesYesIf.length < 12 || resolvesNoIf.length < 12) return null;
    return { resolvesYesIf, resolvesNoIf };
  } catch {
    return null;
  }
}

async function suggestCriteria(input: {
  question: string;
  description: string;
  closeTime: string;
  visibility: string;
}): Promise<{
  resolvesYesIf: string;
  resolvesNoIf: string;
}> {
  const prompt = [
    "You write strict binary market resolution criteria.",
    "Return JSON only with resolvesYesIf and resolvesNoIf.",
    "Rules:",
    "- yes/no criteria must be mutually exclusive",
    "- criteria must be externally verifiable",
    "- avoid subjective language",
    "- include clear deadline/outcome checks when possible",
    "Use the market basics context below and do not invent facts.",
    `Market question: ${input.question || "(not provided)"}`,
    `Market description: ${input.description || "(not provided)"}`,
    `Market visibility: ${input.visibility || "(not provided)"}`,
    `Market close time: ${input.closeTime || "(not provided)"}`,
  ].join("\n");

  const payload = {
    model: DEFAULT_MODEL,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: "Output only valid JSON. No markdown fences or extra keys.",
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: prompt,
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "criteria_suggestion",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["resolvesYesIf", "resolvesNoIf"],
          properties: {
            resolvesYesIf: { type: "string" },
            resolvesNoIf: { type: "string" },
          },
        },
      },
    },
  };

  const parsed = await createOpenAiResponseWithRetry(payload, CRITERIA_OPENAI_TIMEOUT_MS, 1);
  const outputText = extractOpenAiResponseText(parsed);
  const criteria = parseCriteriaJson(outputText);

  if (!criteria) {
    throw new Error("Unable to parse criteria suggestion response.");
  }

  return criteria;
}

export async function POST(request: Request) {
  const parsed = await parseJsonBody<CriteriaSuggestionBody>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;

  const question = cleanText(body.question, 180);
  const description = cleanText(body.description, 3000);
  const closeTime = cleanText(body.closeTime, 120);
  const visibility = cleanText(body.visibility, 40);

  const validationErrors: string[] = [];
  if (question.length < 12) {
    validationErrors.push("question must be at least 12 characters.");
  }
  if (description.length < 30) {
    validationErrors.push("description must be at least 30 characters.");
  }
  if (!closeTime || Number.isNaN(new Date(closeTime).getTime())) {
    validationErrors.push("closeTime must be a valid date.");
  }

  if (validationErrors.length > 0) {
    return jsonError(400, "Validation failed.", { details: validationErrors });
  }

  try {
    const criteria = await suggestCriteria({
      question,
      description,
      closeTime,
      visibility,
    });

    return NextResponse.json({
      criteria,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unable to generate criteria suggestions right now.",
        detail: error instanceof Error ? error.message : "Unknown error.",
      },
      { status: 503 }
    );
  }
}
