import { DEFAULT_SCOUT_MODEL, OPENAI_CALL_TIMEOUT_MS } from "@/lib/automation/market-research/constants";
import { listExistingMarketsForResearch, type ExistingMarketContext } from "@/lib/automation/market-research/db";
import type { GeneratedMarketProposal, ResearchOrganization, ResearchRunScope } from "@/lib/automation/market-research/types";
import { sleep, type RunDeadline } from "@/lib/automation/market-research/utils";
import { requiredEnv } from "@/lib/env";
import { MARKET_CARD_SHADOW_TONES } from "@/lib/markets/presentation";
import { MARKET_CATEGORY_KEYS, MARKET_CATEGORY_LABELS, type MarketCategoryKey } from "@/lib/markets/taxonomy";

type GenerateProposalBatchInput = {
  scope: ResearchRunScope;
  modelName: string;
  scoutModelName?: string;
  maxCandidates: number;
  organization?: ResearchOrganization;
  deadline?: RunDeadline;
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

const DEADLINE_BUFFER_MS = 12_000;
const MIN_OPENAI_CALL_TIMEOUT_MS = 8_000;
const ECONOMY_HEAVY_CATEGORIES = new Set<MarketCategoryKey>(["economy", "finance", "crypto"]);

function categoryPriority(category: MarketCategoryKey): number {
  if (category === "sports") return 0;
  if (ECONOMY_HEAVY_CATEGORIES.has(category)) return 3;
  return 1;
}

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
      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.message.toLowerCase().includes("aborted"))
      ) {
        lastError = new Error(`OpenAI request timed out after ${timeoutMs}ms (attempt ${attempt}/${attempts}).`);
      } else {
        lastError = error instanceof Error ? error : new Error("Unknown OpenAI request error.");
      }
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

function resolveStageTimeoutMs(input: {
  stage: string;
  requestedMs: number;
  deadline?: RunDeadline;
  minTimeoutMs?: number;
}): number {
  const requestedMs = Math.max(1_000, Math.floor(input.requestedMs));
  if (!input.deadline) return requestedMs;

  const minTimeoutMs = Math.max(1_000, input.minTimeoutMs ?? MIN_OPENAI_CALL_TIMEOUT_MS);
  const remainingMs = Math.max(0, input.deadline.timeRemainingMs() - DEADLINE_BUFFER_MS);
  if (remainingMs < minTimeoutMs) {
    throw new Error(`Run deadline nearly exhausted before ${input.stage}.`);
  }

  return Math.min(requestedMs, remainingMs);
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

function compactExistingMarkets(existingMarkets: ExistingMarketContext[], scope: ResearchRunScope): Array<Record<string, unknown>> {
  const cap = scope === "public" ? 180 : 120;
  return existingMarkets.slice(0, cap).map((market) => ({
    question: normalizeString(market.question, 180),
    closeTime: market.closeTime,
    status: market.status,
    visibility: market.visibility,
    eventFingerprint: market.eventFingerprint,
    tags: market.tags.slice(0, 6),
  }));
}

function rebalanceScoutLeads(leads: ScoutLead[], scope: ResearchRunScope, targetLeadCount: number): ScoutLead[] {
  const clampedTarget = Math.max(1, Math.min(64, targetLeadCount));
  const prioritized = [...leads].sort((a, b) => categoryPriority(a.category) - categoryPriority(b.category));
  if (scope !== "public") {
    return prioritized.slice(0, clampedTarget);
  }

  const us = prioritized.filter((lead) => lead.usFocus === true);
  const world = prioritized.filter((lead) => lead.usFocus !== true);
  const targetWorld = Math.max(1, Math.round(clampedTarget * 0.25));
  const targetUs = Math.max(0, clampedTarget - targetWorld);

  const selected: ScoutLead[] = [];
  selected.push(...world.slice(0, targetWorld));
  selected.push(...us.slice(0, targetUs));

  const seen = new Set(selected.map((lead) => lead.id));
  for (const lead of prioritized) {
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
- a concise yes/no-style question seed that is self-contained on its own
- candidateCloseTime in ISO-8601 format, with close between 24 hours and 45 days from now
- category from this list:
${categoryDefinitions}
- resolutionSourceHints naming official entities likely to publish definitive outcomes

Question seed clarity requirements:
- Include specific named entities (team, league, athlete, company, country, agency, event, or tournament) in the question seed.
- Include an explicit time anchor (month/day/year, named event date, or season/year) in the question seed.
- Avoid vague references like "this game", "this event", "they", or "it".

Novelty and clutter control:
- You will receive existing market context.
- Do NOT suggest near-duplicates of existing markets.
- Reject leads if the event, resolution condition, or timing window is too similar to an existing market.
- Keep leads only if they add clear user value as a new edition or a materially different angle.

Sports/Olympics lead quality:
- Prefer markets on actual competitive outcomes (match winner, event winner, medal winner, podium finish, advancement, record-breaking thresholds).
- Prefer high-information outcomes with clear two-sided uncertainty.
- Avoid ceremony/schedule/administrative leads (for example, "will the games begin by date X") unless there is explicit, credible disruption risk.
`.trim();

  if (scope === "public") {
    return `${sharedRules}

Public scan requirements:
- Target roughly 80% U.S. leads and 20% global leads.
- Prioritize events with broad consumer relevance.
- Exclude events already resolved or clearly stale.
- Keep lead mix broad: economy/finance/crypto combined should usually be no more than about 35% of the batch.
- Include meaningful non-economy opportunities each run, especially sports plus politics/geopolitics/tech/culture/world/climate-science.
`.trim();
  }

  return `${sharedRules}

Institution scan requirements:
- Focus on institution-relevant sports, competitions, and official announcements.
- Prioritize leads where a school/league/organizer source can resolve objectively.
`.trim();
}

function buildScoutUserPrompt(
  input: GenerateProposalBatchInput,
  leadTarget: number,
  existingMarkets: ExistingMarketContext[]
): string {
  const nowIso = new Date().toISOString();
  const existingContextJson = jsonString({
    markets: compactExistingMarkets(existingMarkets, input.scope),
  });

  if (input.scope === "public") {
    return `
Current UTC time: ${nowIso}

Generate up to ${leadTarget} PUBLIC event leads.
Only include opportunities with candidate close windows between 24 hours and 45 days from now.
Do not include events that are already in the past.
Keep leads concise and high-signal.

Existing market context for duplicate/clutter filtering:
${existingContextJson}
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

Existing market context for duplicate/clutter filtering:
${existingContextJson}
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
- keep question concise, answerable, and self-contained as a card title.
- question must name the specific subject and context (who/what/which competition or event).
- question should include an explicit time anchor (date/month/year/season) instead of vague timing.
- avoid vague references like "this game", "this event", "they", or "it".
- include tags and riskFlags.
- eventFingerprint should be stable across repeated scans for the same event.
- if official source quality is unclear, do not include that proposal.
- for sports categories, prioritize competitive outcomes (who wins/advances/medals) over administrative timing.
- avoid low-information schedule-confirmation questions unless they capture a genuine contested uncertainty.
`.trim();

  if (scope === "public") {
    return `${sharedRules}

Public scan requirements:
- Maintain approximately 80% U.S. focus and 20% world opportunities.
- Prefer near-term events with broad market interest.
- Avoid stale, duplicate-feeling, or low-resolution-confidence markets.
- Keep final proposal mix broad: economy/finance/crypto combined should usually be no more than about 35%.
- Ensure strong non-economy coverage, especially sports and at least a few from politics/geopolitics/tech/culture/world/climate-science when quality allows.
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

async function runScoutStage(
  input: GenerateProposalBatchInput,
  scoutModelName: string,
  existingMarkets: ExistingMarketContext[]
): Promise<ScoutLead[]> {
  const leadTarget = Math.max(Math.min(input.maxCandidates * 4, 64), 8);
  input.deadline?.throwIfExpired("starting scout model stage");
  const scoutTimeoutMs = resolveStageTimeoutMs({
    stage: "scout model call",
    requestedMs: Math.max(90_000, OPENAI_CALL_TIMEOUT_MS),
    deadline: input.deadline,
    minTimeoutMs: 15_000,
  });

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
        content: [{ type: "input_text", text: buildScoutUserPrompt(input, leadTarget, existingMarkets) }],
      },
    ],
  } as const satisfies Record<string, unknown>;

  const response = await createResponseWithRetry(payload, scoutTimeoutMs, 2);
  input.deadline?.throwIfExpired("parsing scout stage output");
  const parsed = parseResponseJson(response, "scout");
  const leads = toScoutLeads(parsed);
  if (leads.length === 0) {
    throw new Error(`Scout stage returned zero leads. Parsed payload: ${jsonString(parsed).slice(0, 320)}.`);
  }

  return rebalanceScoutLeads(leads, input.scope, leadTarget);
}

async function runProposalStage(input: GenerateProposalBatchInput, leads: ScoutLead[]): Promise<GeneratedMarketProposal[]> {
  const useWebSearch = cleanBoolean(process.env.MARKET_RESEARCH_USE_WEB_SEARCH);
  input.deadline?.throwIfExpired("starting proposal model stage");
  const proposalTimeoutMs = resolveStageTimeoutMs({
    stage: "proposal model call",
    requestedMs: OPENAI_CALL_TIMEOUT_MS,
    deadline: input.deadline,
    minTimeoutMs: 15_000,
  });

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
    const directResponse = await createResponseWithRetry(payload, proposalTimeoutMs, 1);
    input.deadline?.throwIfExpired("parsing proposal stage output");
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
      proposalTimeoutMs,
      1
    );
  } catch (error) {
    if (!isTimeoutLikeError(error)) {
      throw error;
    }

    response = await createResponseWithRetry(
      payload,
      resolveStageTimeoutMs({
        stage: "proposal fallback call",
        requestedMs: Math.min(60_000, proposalTimeoutMs),
        deadline: input.deadline,
        minTimeoutMs: 5_000,
      }),
      1
    );
  }

  input.deadline?.throwIfExpired("parsing proposal stage output");
  const parsed = parseResponseJson(response, "proposal");
  const proposals = toGeneratedProposals(parsed).slice(0, input.maxCandidates);
  if (proposals.length === 0) {
    throw new Error(`Proposal stage returned zero proposals. Parsed payload: ${jsonString(parsed).slice(0, 320)}.`);
  }

  return proposals;
}

export async function generateProposalBatch(input: GenerateProposalBatchInput): Promise<GeneratedMarketProposal[]> {
  const scoutModelName = input.scoutModelName?.trim() || DEFAULT_SCOUT_MODEL;
  input.deadline?.throwIfExpired("loading existing market context");
  const existingMarkets = await listExistingMarketsForResearch({
    scope: input.scope,
    organizationId: input.organization?.id,
  });
  input.deadline?.throwIfExpired("running scout stage");
  const leads = await runScoutStage(input, scoutModelName, existingMarkets);

  const leadBudget = Math.max(Math.min(input.maxCandidates * 3, leads.length), 4);
  const shortlistedLeads = rebalanceScoutLeads(leads, input.scope, leadBudget);

  input.deadline?.throwIfExpired("running proposal stage");
  return runProposalStage(input, shortlistedLeads);
}
