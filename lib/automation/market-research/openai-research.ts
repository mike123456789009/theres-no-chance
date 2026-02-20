import { DEFAULT_SCOUT_MODEL, OPENAI_CALL_TIMEOUT_MS } from "@/lib/automation/market-research/constants";
import type { GeneratedMarketProposal, ResearchOrganization, ResearchRunScope } from "@/lib/automation/market-research/types";
import { sleep } from "@/lib/automation/market-research/utils";
import { requiredEnv } from "@/lib/env";
import { MARKET_CARD_SHADOW_TONES } from "@/lib/markets/presentation";
import { MARKET_CATEGORY_KEYS, MARKET_CATEGORY_LABELS, type MarketCategoryKey } from "@/lib/markets/taxonomy";

type GenerateProposalBatchInput = {
  scope: ResearchRunScope;
  modelName: string;
  scoutModelName?: string;
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

type ScoutLead = {
  id: string;
  headline: string;
  questionSeed: string;
  category: MarketCategoryKey;
  usFocus: boolean;
  whyNow: string;
  candidateCloseTime: string;
  resolutionSourceHints: string[];
};

const SCOUT_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["leads"],
  properties: {
    leads: {
      type: "array",
      minItems: 0,
      maxItems: 64,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "headline",
          "questionSeed",
          "category",
          "usFocus",
          "whyNow",
          "candidateCloseTime",
          "resolutionSourceHints",
        ],
        properties: {
          id: { type: "string" },
          headline: { type: "string" },
          questionSeed: { type: "string" },
          category: { type: "string", enum: [...MARKET_CATEGORY_KEYS] },
          usFocus: { type: "boolean" },
          whyNow: { type: "string" },
          candidateCloseTime: { type: "string" },
          resolutionSourceHints: {
            type: "array",
            maxItems: 6,
            items: { type: "string" },
          },
        },
      },
    },
  },
};

const PROPOSAL_OUTPUT_SCHEMA: Record<string, unknown> = {
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

function parseResponseJson(response: OpenAiResponse, label: string): unknown {
  const text = getResponseText(response);
  if (!text) {
    throw new Error(`OpenAI returned empty content for ${label} response ${response.id}.`);
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

function buildResearchTools(scope: ResearchRunScope): Array<Record<string, unknown>> {
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

function toGeneratedProposals(raw: unknown): GeneratedMarketProposal[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const proposalsRaw = (raw as { proposals?: unknown }).proposals;
  if (!Array.isArray(proposalsRaw)) return [];
  return proposalsRaw as GeneratedMarketProposal[];
}

function normalizeString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function isAllowedCategory(value: string): value is MarketCategoryKey {
  return (MARKET_CATEGORY_KEYS as readonly string[]).includes(value);
}

function toScoutLeads(raw: unknown): ScoutLead[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];

  const leadsRaw = (raw as { leads?: unknown }).leads;
  if (!Array.isArray(leadsRaw)) return [];

  const normalized: ScoutLead[] = [];
  for (const lead of leadsRaw) {
    if (!lead || typeof lead !== "object" || Array.isArray(lead)) continue;
    const entry = lead as Record<string, unknown>;

    const categoryRaw = normalizeString(entry.category, 60).toLowerCase();
    if (!isAllowedCategory(categoryRaw)) continue;

    const hintsRaw = Array.isArray(entry.resolutionSourceHints)
      ? entry.resolutionSourceHints
      : [];

    const hintStrings = hintsRaw
      .map((hint) => normalizeString(hint, 140))
      .filter((hint) => hint.length > 0)
      .slice(0, 6);

    const id = normalizeString(entry.id, 120).toLowerCase();
    const headline = normalizeString(entry.headline, 180);
    const questionSeed = normalizeString(entry.questionSeed, 180);
    const whyNow = normalizeString(entry.whyNow, 360);
    const candidateCloseTime = normalizeString(entry.candidateCloseTime, 80);

    if (!id || !headline || !questionSeed || !whyNow || !candidateCloseTime) continue;

    normalized.push({
      id,
      headline,
      questionSeed,
      category: categoryRaw,
      usFocus: entry.usFocus === true,
      whyNow,
      candidateCloseTime,
      resolutionSourceHints: hintStrings,
    });
  }

  const deduped = new Map<string, ScoutLead>();
  for (const lead of normalized) {
    if (!deduped.has(lead.id)) {
      deduped.set(lead.id, lead);
    }
  }

  return Array.from(deduped.values());
}

function rebalanceScoutLeads(leads: ScoutLead[], scope: ResearchRunScope, targetLeadCount: number): ScoutLead[] {
  const clampedTarget = Math.max(1, Math.min(64, targetLeadCount));
  if (scope !== "public") {
    return leads.slice(0, clampedTarget);
  }

  const us = leads.filter((lead) => lead.usFocus === true);
  const world = leads.filter((lead) => lead.usFocus !== true);
  const targetWorld = Math.max(1, Math.round(clampedTarget * 0.25));
  const targetUs = Math.max(0, clampedTarget - targetWorld);

  const selected: ScoutLead[] = [];
  selected.push(...world.slice(0, targetWorld));
  selected.push(...us.slice(0, targetUs));

  const seen = new Set(selected.map((lead) => lead.id));
  for (const lead of leads) {
    if (seen.has(lead.id)) continue;
    selected.push(lead);
    seen.add(lead.id);
    if (selected.length >= clampedTarget) break;
  }

  return selected.slice(0, clampedTarget);
}

function buildScoutSystemPrompt(scope: ResearchRunScope): string {
  const categoryDefinitions = MARKET_CATEGORY_KEYS.map(
    (category) => `${category}: ${MARKET_CATEGORY_LABELS[category]}`
  ).join("\n");

  const sharedRules = `
You are an event scout for a prediction-market platform.
Return strictly valid JSON that matches the provided schema.
Your job in this step is NOT to create final markets.
Your job is to rapidly surface plausible event leads for deeper investigation.

Every lead MUST include:
- a stable id slug for dedupe
- a concise yes/no-style question seed
- candidateCloseTime in ISO-8601 format, with close between 24 hours and 45 days from now
- category from this list:
${categoryDefinitions}
- resolutionSourceHints naming official entities likely to publish definitive outcomes
`.trim();

  if (scope === "public") {
    return `${sharedRules}

Public scan requirements:
- Target roughly 80% U.S. leads and 20% global leads.
- Prioritize events with broad consumer relevance.
- Exclude events already resolved or clearly stale.
`.trim();
  }

  return `${sharedRules}

Institution scan requirements:
- Focus on institution-relevant sports, competitions, and official announcements.
- Prioritize leads where a school/league/organizer source can resolve objectively.
`.trim();
}

function buildScoutUserPrompt(input: GenerateProposalBatchInput, leadTarget: number): string {
  const nowIso = new Date().toISOString();

  if (input.scope === "public") {
    return `
Current UTC time: ${nowIso}

Generate up to ${leadTarget} PUBLIC event leads.
Only include opportunities with candidate close windows between 24 hours and 45 days from now.
Do not include events that are already in the past.
Keep leads concise and high-signal.
`.trim();
  }

  const organization = input.organization;
  const domains = organization?.domains.map((domain) => domain.domain).join(", ") || "(none provided)";

  return `
Current UTC time: ${nowIso}

Generate up to ${leadTarget} INSTITUTION event leads for:
- Organization name: ${organization?.name ?? "Unknown organization"}
- Organization slug: ${organization?.slug ?? "unknown"}
- Verified domains: ${domains}

Do not include events already in the past.
Focus on institution-relevant outcomes that can be objectively resolved from official sources.
`.trim();
}

function buildProposalSystemPrompt(scope: ResearchRunScope): string {
  const categoryDefinitions = MARKET_CATEGORY_KEYS.map(
    (category) => `${category}: ${MARKET_CATEGORY_LABELS[category]}`
  ).join("\n");

  const sharedRules = `
You are an expert prediction-market researcher and proposal writer.
Return strictly valid JSON that matches the provided schema.
Only include proposals that are production-grade and suitable for admin review.

You will receive scout leads from a cheaper model.
For each lead, investigate and only keep leads that can be resolved objectively.
Skip weak leads instead of forcing output.

Every proposal MUST include:
- clear yes/no resolution predicates that are mutually exclusive
- closeTime and expectedResolutionTime in ISO-8601 format
- at least one official https source URL that can serve as a final resolution authority
- deterministic category from this list:
${categoryDefinitions}
- cardShadowTone from this list: ${MARKET_CARD_SHADOW_TONES.join(", ")}

Important:
- feeBps should usually be 200 unless exceptional.
- keep question concise and answerable.
- include tags and riskFlags.
- eventFingerprint should be stable across repeated scans for the same event.
- if official source quality is unclear, do not include that proposal.
`.trim();

  if (scope === "public") {
    return `${sharedRules}

Public scan requirements:
- Maintain approximately 80% U.S. focus and 20% world opportunities.
- Prefer near-term events with broad market interest.
- Avoid stale, duplicate-feeling, or low-resolution-confidence markets.
`.trim();
  }

  return `${sharedRules}

Institution scan requirements:
- Focus on athletics, competitions/tournaments, and institution-specific milestones.
- Proposals must be institution-specific and private-friendly.
- If you include accessRules, keep them machine-readable and concise.
`.trim();
}

function buildProposalUserPrompt(input: GenerateProposalBatchInput, leads: ScoutLead[]): string {
  const nowIso = new Date().toISOString();
  const serializedLeads = jsonString({ leads });

  if (input.scope === "public") {
    return `
Current UTC time: ${nowIso}

Investigate the following PUBLIC scout leads and return up to ${input.maxCandidates} final proposals.
You may return fewer than ${input.maxCandidates} if quality is not strong enough.
Only output proposals with at least one credible official resolution source URL.

Scout leads JSON:
${serializedLeads}
`.trim();
  }

  const organization = input.organization;
  const domains = organization?.domains.map((domain) => domain.domain).join(", ") || "(none provided)";

  return `
Current UTC time: ${nowIso}

Investigate the following INSTITUTION scout leads and return up to ${input.maxCandidates} final proposals.
You may return fewer than ${input.maxCandidates} if quality is not strong enough.

Organization context:
- Name: ${organization?.name ?? "Unknown organization"}
- Slug: ${organization?.slug ?? "unknown"}
- Verified domains: ${domains}

Only output proposals with at least one credible official resolution source URL.

Scout leads JSON:
${serializedLeads}
`.trim();
}

async function runScoutStage(input: GenerateProposalBatchInput, scoutModelName: string): Promise<ScoutLead[]> {
  const leadTarget = Math.max(Math.min(input.maxCandidates * 4, 64), 8);

  const payload = {
    model: scoutModelName,
    text: {
      format: {
        type: "json_schema",
        name: "market_research_scout_batch",
        schema: SCOUT_OUTPUT_SCHEMA,
        strict: true,
      },
    },
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: buildScoutSystemPrompt(input.scope) }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: buildScoutUserPrompt(input, leadTarget) }],
      },
    ],
  } as const satisfies Record<string, unknown>;

  const response = await createResponseWithRetry(payload, Math.min(90_000, OPENAI_CALL_TIMEOUT_MS), 1);
  const parsed = parseResponseJson(response, "scout");
  const leads = toScoutLeads(parsed);
  if (leads.length === 0) {
    throw new Error(`Scout stage returned zero leads. Parsed payload: ${jsonString(parsed).slice(0, 320)}.`);
  }

  return rebalanceScoutLeads(leads, input.scope, leadTarget);
}

async function runProposalStage(input: GenerateProposalBatchInput, leads: ScoutLead[]): Promise<GeneratedMarketProposal[]> {
  const useWebSearch = cleanBoolean(process.env.MARKET_RESEARCH_USE_WEB_SEARCH);

  const payload = {
    model: input.modelName,
    text: {
      format: {
        type: "json_schema",
        name: "market_research_batch",
        schema: PROPOSAL_OUTPUT_SCHEMA,
        strict: true,
      },
    },
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: buildProposalSystemPrompt(input.scope) }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: buildProposalUserPrompt(input, leads) }],
      },
    ],
  } as const satisfies Record<string, unknown>;

  if (!useWebSearch) {
    const directResponse = await createResponseWithRetry(payload, OPENAI_CALL_TIMEOUT_MS, 1);
    const parsed = parseResponseJson(directResponse, "proposal");
    const proposals = toGeneratedProposals(parsed).slice(0, input.maxCandidates);
    if (proposals.length === 0) {
      throw new Error(`Proposal stage returned zero proposals. Parsed payload: ${jsonString(parsed).slice(0, 320)}.`);
    }
    return proposals;
  }

  let response: OpenAiResponse;
  try {
    response = await createResponseWithRetry(
      {
        ...payload,
        tools: buildResearchTools(input.scope),
      },
      OPENAI_CALL_TIMEOUT_MS,
      1
    );
  } catch (error) {
    if (!isTimeoutLikeError(error)) {
      throw error;
    }

    response = await createResponseWithRetry(payload, Math.min(60_000, OPENAI_CALL_TIMEOUT_MS), 1);
  }

  const parsed = parseResponseJson(response, "proposal");
  const proposals = toGeneratedProposals(parsed).slice(0, input.maxCandidates);
  if (proposals.length === 0) {
    throw new Error(`Proposal stage returned zero proposals. Parsed payload: ${jsonString(parsed).slice(0, 320)}.`);
  }

  return proposals;
}

export async function generateProposalBatch(input: GenerateProposalBatchInput): Promise<GeneratedMarketProposal[]> {
  const scoutModelName = input.scoutModelName?.trim() || DEFAULT_SCOUT_MODEL;
  const leads = await runScoutStage(input, scoutModelName);

  const leadBudget = Math.max(Math.min(input.maxCandidates * 3, leads.length), 4);
  const shortlistedLeads = rebalanceScoutLeads(leads, input.scope, leadBudget);

  return runProposalStage(input, shortlistedLeads);
}
