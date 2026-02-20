import { requiredEnv } from "@/lib/env";
import { MARKET_CARD_SHADOW_TONES } from "@/lib/markets/presentation";
import { MARKET_CATEGORY_KEYS, MARKET_CATEGORY_LABELS } from "@/lib/markets/taxonomy";
import { OPENAI_CALL_TIMEOUT_MS } from "@/lib/automation/market-research/constants";
import type { GeneratedMarketProposal, ResearchOrganization, ResearchRunScope } from "@/lib/automation/market-research/types";
import { sleep } from "@/lib/automation/market-research/utils";

type GenerateProposalBatchInput = {
  scope: ResearchRunScope;
  modelName: string;
  maxCandidates: number;
  organization?: ResearchOrganization;
};

type OpenAiResponse = {
  id: string;
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

const OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["proposals"],
  properties: {
    proposals: {
      type: "array",
      minItems: 0,
      maxItems: 24,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "question",
          "description",
          "resolvesYesIf",
          "resolvesNoIf",
          "closeTime",
          "expectedResolutionTime",
          "evidenceRules",
          "disputeRules",
          "feeBps",
          "visibility",
          "accessRules",
          "tags",
          "riskFlags",
          "sources",
          "cardShadowTone",
          "confidence",
          "eventFingerprint",
          "rationale",
          "category",
          "usFocus",
        ],
        properties: {
          question: { type: "string" },
          description: { type: "string" },
          resolvesYesIf: { type: "string" },
          resolvesNoIf: { type: "string" },
          closeTime: { type: "string" },
          expectedResolutionTime: { type: ["string", "null"] },
          evidenceRules: { type: ["string", "null"] },
          disputeRules: { type: ["string", "null"] },
          feeBps: { type: "number" },
          visibility: { type: "string", enum: ["public", "unlisted", "private"] },
          accessRules: {
            type: "object",
            additionalProperties: false,
            properties: {},
            required: [],
          },
          tags: { type: "array", items: { type: "string" }, maxItems: 12 },
          riskFlags: { type: "array", items: { type: "string" }, maxItems: 10 },
          sources: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "url", "type"],
              properties: {
                label: { type: "string" },
                url: { type: "string" },
                type: { type: "string", enum: ["official", "supporting", "rules"] },
              },
            },
          },
          cardShadowTone: { type: "string", enum: [...MARKET_CARD_SHADOW_TONES] },
          confidence: { type: "number" },
          eventFingerprint: { type: "string" },
          rationale: { type: "string" },
          category: { type: "string", enum: [...MARKET_CATEGORY_KEYS] },
          usFocus: { type: "boolean" },
        },
      },
    },
  },
};

function jsonString(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function cleanBoolean(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function getResponseText(response: OpenAiResponse): string {
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

async function createResponseWithRetry(
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
      lastError = error instanceof Error ? error : new Error("Unknown OpenAI request error.");
      if (attempt >= attempts) {
        throw lastError;
      }
      const backoffMs = 450 * 2 ** (attempt - 1);
      await sleep(backoffMs);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  throw lastError ?? new Error("OpenAI call failed with no error details.");
}

function isTimeoutLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const normalized = error.message.toLowerCase();
  return (
    normalized.includes("aborted") ||
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("aborterror")
  );
}

function buildTools(scope: ResearchRunScope): Array<Record<string, unknown>> {
  if (scope === "public") {
    return [
      {
        type: "web_search_preview",
        user_location: {
          type: "approximate",
          country: "US",
        },
        search_context_size: "medium",
      },
    ];
  }

  return [{ type: "web_search_preview", search_context_size: "medium" }];
}

function buildSystemPrompt(scope: ResearchRunScope): string {
  const categoryDefinitions = MARKET_CATEGORY_KEYS.map((category) => `${category}: ${MARKET_CATEGORY_LABELS[category]}`).join("\n");

  const sharedRules = `
You are an expert prediction-market researcher.
Return strictly valid JSON that matches the provided schema.
Proposal quality must be production-grade and ready for admin review.

Every proposal MUST include:
- clear yes/no resolution predicates that are mutually exclusive
- closeTime and expectedResolutionTime in ISO-8601
- at least one official source URL (https only)
- deterministic category from this list:
${categoryDefinitions}
- cardShadowTone from this list: ${MARKET_CARD_SHADOW_TONES.join(", ")}

Important:
- feeBps should usually be 200 unless exceptional.
- keep question concise and answerable.
- include tags and riskFlags.
- eventFingerprint should be stable across repeated scans for the same event.
`.trim();

  if (scope === "public") {
    return `${sharedRules}

Public scan requirements:
- U.S.-first mix at roughly 80% U.S. and 20% world opportunities.
- Focus on upcoming decision/event style markets across the listed categories.
- Avoid past events or ambiguous events.
`.trim();
  }

  return `${sharedRules}

Institution scan requirements:
- Focus on athletics events, competitions/tournaments, and administrative milestones.
- Proposals must be institution-specific and suitable for private visibility.
- If you include accessRules, keep them machine-readable and concise.
`.trim();
}

function buildUserPrompt(input: GenerateProposalBatchInput): string {
  if (input.scope === "public") {
    return `
Generate up to ${input.maxCandidates} candidate PUBLIC market proposals.
Only include events with expected close windows between 24 hours and 45 days from now.
Ensure at least some global non-U.S. opportunities while remaining U.S.-first.
`.trim();
  }

  const organization = input.organization;
  const domains = organization?.domains.map((domain) => domain.domain).join(", ") || "(none provided)";
  return `
Generate up to ${input.maxCandidates} candidate INSTITUTION market proposals for:
- Organization name: ${organization?.name ?? "Unknown organization"}
- Organization slug: ${organization?.slug ?? "unknown"}
- Verified domains: ${domains}

All candidates should be institution-relevant and private-friendly.
`.trim();
}

function toGeneratedProposals(raw: unknown): GeneratedMarketProposal[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const proposalsRaw = (raw as { proposals?: unknown }).proposals;
  if (!Array.isArray(proposalsRaw)) return [];
  return proposalsRaw as GeneratedMarketProposal[];
}

export async function generateProposalBatch(input: GenerateProposalBatchInput): Promise<GeneratedMarketProposal[]> {
  const useWebSearch = cleanBoolean(process.env.MARKET_RESEARCH_USE_WEB_SEARCH);
  const basePayload = {
    model: input.modelName,
    reasoning: { effort: "low" },
    text: {
      format: {
        type: "json_schema",
        name: "market_research_batch",
        schema: OUTPUT_SCHEMA,
        strict: true,
      },
    },
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: buildSystemPrompt(input.scope) }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: buildUserPrompt(input) }],
      },
    ],
  } as const satisfies Record<string, unknown>;

  if (!useWebSearch) {
    const directResponse = await createResponseWithRetry(
      {
        ...basePayload,
      },
      OPENAI_CALL_TIMEOUT_MS,
      1
    );

    const directText = getResponseText(directResponse);
    if (!directText) {
      throw new Error(`OpenAI returned empty content for response ${directResponse.id}.`);
    }

    let directParsed: unknown;
    try {
      directParsed = JSON.parse(directText);
    } catch (error) {
      throw new Error(
        `Unable to parse OpenAI structured output as JSON: ${
          error instanceof Error ? error.message : "unknown parse error"
        }. Raw: ${directText.slice(0, 240)}.`
      );
    }

    const directProposals = toGeneratedProposals(directParsed).slice(0, input.maxCandidates);
    if (directProposals.length === 0) {
      throw new Error(`OpenAI returned zero proposals. Parsed payload: ${jsonString(directParsed).slice(0, 300)}.`);
    }

    return directProposals;
  }

  let response: OpenAiResponse;
  try {
    response = await createResponseWithRetry(
      {
        ...basePayload,
        tools: buildTools(input.scope),
      },
      OPENAI_CALL_TIMEOUT_MS,
      1
    );
  } catch (error) {
    if (!isTimeoutLikeError(error)) {
      throw error;
    }

    response = await createResponseWithRetry(
      {
        ...basePayload,
      },
      Math.min(60_000, OPENAI_CALL_TIMEOUT_MS),
      1
    );
  }

  const text = getResponseText(response);
  if (!text) {
    throw new Error(`OpenAI returned empty content for response ${response.id}.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Unable to parse OpenAI structured output as JSON: ${error instanceof Error ? error.message : "unknown parse error"}. Raw: ${text.slice(0, 240)}.`);
  }

  const proposals = toGeneratedProposals(parsed).slice(0, input.maxCandidates);
  if (proposals.length === 0) {
    throw new Error(`OpenAI returned zero proposals. Parsed payload: ${jsonString(parsed).slice(0, 300)}.`);
  }

  return proposals;
}
