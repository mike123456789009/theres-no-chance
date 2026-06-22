import { existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import * as activeStepExports from "@/components/markets/create-market/steps";
import { WIZARD_STEPS } from "@/components/markets/create-market/types";

const inactiveSplitStepPaths = [
  "components/markets/create-market/steps/listing-fee-step.tsx",
  "components/markets/create-market/steps/rake-step.tsx",
  "components/markets/create-market/steps/resolvable-step.tsx",
];

describe("create-market wizard step boundary", () => {
  it("keeps the active wizard on the six canonical steps", () => {
    expect(WIZARD_STEPS).toEqual([
      { id: "rules", label: "Rules" },
      { id: "evidence", label: "Economics + policy" },
      { id: "basics", label: "Basics" },
      { id: "criteria", label: "Criteria" },
      { id: "sources", label: "References" },
      { id: "review", label: "Review" },
    ]);
  });

  it("keeps inactive split economics step files out of the active component tree", () => {
    const presentPaths = inactiveSplitStepPaths.filter((relativePath) => existsSync(path.join(process.cwd(), relativePath)));

    expect(presentPaths).toEqual([]);
    expect(Object.keys(activeStepExports).sort()).toEqual([
      "BasicsStep",
      "CriteriaStep",
      "EvidenceStep",
      "ReviewStep",
      "RulesStep",
      "SourcesStep",
    ]);
  });
});
