#!/usr/bin/env tsx

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type ResearchRunSummary = {
  scope: "public" | "institution";
  runId: string;
  status: "completed" | "partial" | "failed" | "skipped";
  modelName: string;
  scoutModelName?: string;
  startedAt: string;
  completedAt?: string;
  generated: number;
  submitted: number;
  skippedDuplicate: number;
  skippedQuality: number;
  skippedInvalid: number;
  submitFailed: number;
  topSubmittedQuestions: string[];
  failuresByInstitution?: Array<{ organizationId: string; organizationName: string; error: string }>;
};

type RunnerArgs = {
  scope: "public" | "institution";
  submit: boolean;
  max: number | null;
  organizationId: string | null;
  modelName: string | null;
  scoutModelName: string | null;
};

function isKnownScopeValue(value: string): value is "public" | "institution" {
  return value === "public" || value === "institution";
}

function loadSimpleEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  const raw = readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const delimiter = trimmed.indexOf("=");
    if (delimiter <= 0) continue;
    const key = trimmed.slice(0, delimiter).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key]) continue;

    let value = trimmed.slice(delimiter + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function loadRunnerEnv() {
  const cwd = process.cwd();
  loadSimpleEnvFile(path.join(cwd, ".env"));
  loadSimpleEnvFile(path.join(cwd, ".env.local"));
}

function parseArgs(argv: string[]): RunnerArgs {
  let scopeRaw = "";
  let submit = true;
  let max: number | null = null;
  let organizationId: string | null = null;
  let modelName: string | null = null;
  let scoutModelName: string | null = null;

  for (const arg of argv) {
    if (arg.startsWith("--scope=")) {
      scopeRaw = arg.slice("--scope=".length).trim().toLowerCase();
      continue;
    }
    if (arg === "--submit") {
      submit = true;
      continue;
    }
    if (arg === "--dry-run") {
      submit = false;
      continue;
    }
    if (arg === "--no-submit") {
      submit = false;
      continue;
    }
    if (arg.startsWith("--max=")) {
      const parsed = Number.parseInt(arg.slice("--max=".length).trim(), 10);
      if (Number.isFinite(parsed)) {
        max = parsed;
      }
      continue;
    }
    if (arg.startsWith("--organization-id=")) {
      const value = arg.slice("--organization-id=".length).trim();
      organizationId = value.length > 0 ? value : null;
      continue;
    }
    if (arg.startsWith("--model=")) {
      const value = arg.slice("--model=".length).trim();
      modelName = value.length > 0 ? value : null;
      continue;
    }
    if (arg.startsWith("--scout-model=")) {
      const value = arg.slice("--scout-model=".length).trim();
      scoutModelName = value.length > 0 ? value : null;
      continue;
    }
  }

  if (!isKnownScopeValue(scopeRaw)) {
    throw new Error("Missing or invalid --scope. Use --scope=public or --scope=institution.");
  }

  return {
    scope: scopeRaw,
    submit,
    max,
    organizationId,
    modelName,
    scoutModelName,
  };
}

function renderSummaryMarkdown(summary: ResearchRunSummary): string {
  const lines: string[] = [];

  lines.push(`# AI Market Scout Run (${summary.scope})`);
  lines.push("");
  lines.push(`- Run id: \`${summary.runId}\``);
  lines.push(`- Status: \`${summary.status}\``);
  lines.push(`- Model: \`${summary.modelName}\``);
  if (summary.scoutModelName) {
    lines.push(`- Scout model: \`${summary.scoutModelName}\``);
  }
  lines.push(`- Started: ${summary.startedAt}`);
  lines.push(`- Completed: ${summary.completedAt ?? "in-progress"}`);
  lines.push(`- Generated: ${summary.generated}`);
  lines.push(`- Submitted: ${summary.submitted}`);
  lines.push(`- Skipped duplicate: ${summary.skippedDuplicate}`);
  lines.push(`- Skipped quality: ${summary.skippedQuality}`);
  lines.push(`- Skipped invalid: ${summary.skippedInvalid}`);
  lines.push(`- Submit failed: ${summary.submitFailed}`);

  if (summary.topSubmittedQuestions.length > 0) {
    lines.push("");
    lines.push("## Top submitted market questions");
    for (const question of summary.topSubmittedQuestions.slice(0, 8)) {
      lines.push(`- ${question}`);
    }
  }

  if (summary.failuresByInstitution && summary.failuresByInstitution.length > 0) {
    lines.push("");
    lines.push("## Failures by institution");
    for (const failure of summary.failuresByInstitution) {
      lines.push(`- ${failure.organizationName} (\`${failure.organizationId}\`): ${failure.error}`);
    }
  }

  return lines.join("\n");
}

async function main() {
  loadRunnerEnv();
  const { DEFAULT_INSTITUTION_MAX_PER_ORG, DEFAULT_PUBLIC_MAX, DEFAULT_RESEARCH_MODEL, DEFAULT_SCOUT_MODEL } = await import(
    "../lib/automation/market-research/constants"
  );
  const { isKnownScope, runInstitutionResearch, runPublicResearch } = await import(
    "../lib/automation/market-research/runner"
  );

  const args = parseArgs(process.argv.slice(2));
  if (!isKnownScope(args.scope)) {
    throw new Error("Missing or invalid --scope. Use --scope=public or --scope=institution.");
  }
  const modelName = args.modelName ?? DEFAULT_RESEARCH_MODEL;
  const scoutModelName = args.scoutModelName ?? DEFAULT_SCOUT_MODEL;

  if (args.scope === "public") {
    const summary = await runPublicResearch({
      submit: args.submit,
      maxToSubmit: args.max ?? DEFAULT_PUBLIC_MAX,
      modelName,
      scoutModelName,
    });
    console.log(renderSummaryMarkdown(summary));
    if (summary.status === "failed") {
      process.exitCode = 1;
    }
    return;
  }

  const summary = await runInstitutionResearch({
    submit: args.submit,
    maxPerOrganization: args.max ?? DEFAULT_INSTITUTION_MAX_PER_ORG,
    modelName,
    scoutModelName,
    organizationId: args.organizationId ?? undefined,
  });
  console.log(renderSummaryMarkdown(summary));
  if (summary.status === "failed") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown market research runner error.";
  console.error(`# AI Market Scout Run Failed\n\n- Error: ${message}`);
  process.exitCode = 1;
});
