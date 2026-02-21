import { NextResponse } from "next/server";

import { requiredEnv } from "@/lib/env";

type CriteriaSuggestionBody = {
  idea?: unknown;
  question?: unknown;
  closeTime?: unknown;
};

type OpenAiResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

const DEFAULT_MODEL = process.env.MARKET_CRITERIA_MODEL?.trim() || "gpt-5-mini";

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function extractOutputText(response: OpenAiResponse): string {
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

async function suggestCriteria(input: { idea: string; question: string; closeTime: string }): Promise<{
  resolvesYesIf: string;
  resolvesNoIf: string;
}> {
  const apiKey = requiredEnv("OPENAI_API_KEY");

  const prompt = [
    "You write strict binary market resolution criteria.",
    "Return JSON only with resolvesYesIf and resolvesNoIf.",
    "Rules:",
    "- yes/no criteria must be mutually exclusive",
    "- criteria must be externally verifiable",
    "- avoid subjective language",
    "- include clear deadline/outcome checks when possible",
    `Market question: ${input.question || "(not provided)"}`,
    `Market idea/context: ${input.idea}`,
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

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI criteria request failed (${response.status}): ${text.slice(0, 220)}`);
  }

  const parsed = JSON.parse(text) as OpenAiResponse;
  const outputText = extractOutputText(parsed);
  const criteria = parseCriteriaJson(outputText);

  if (!criteria) {
    throw new Error("Unable to parse criteria suggestion response.");
  }

  return criteria;
}

export async function POST(request: Request) {
  let body: CriteriaSuggestionBody;
  try {
    body = (await request.json()) as CriteriaSuggestionBody;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const idea = cleanText(body.idea, 3000);
  const question = cleanText(body.question, 180);
  const closeTime = cleanText(body.closeTime, 120);

  if (idea.length < 12) {
    return NextResponse.json(
      {
        error: "Validation failed.",
        details: ["idea must be at least 12 characters."],
      },
      { status: 400 }
    );
  }

  try {
    const criteria = await suggestCriteria({
      idea,
      question,
      closeTime,
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
