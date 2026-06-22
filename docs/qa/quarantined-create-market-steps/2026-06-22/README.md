# Quarantined Inactive Create-Market Steps

## Context

`CreateMarketForm` uses the six canonical wizard steps from `WIZARD_STEPS`: Rules, Economics + policy, Basics, Criteria, References, and Review.

During the feature user-story QA loop, three untracked split-step components existed under the active step directory:

- `listing-fee-step.tsx`
- `rake-step.tsx`
- `resolvable-step.tsx`

Those files were not exported from the step barrel, were not part of `WIZARD_STEPS`, and duplicated copy already present in the active Rules/Economics + policy flow.

## Quarantine Action

The untracked files were moved out of the active component tree and preserved here as `.txt` evidence:

- `listing-fee-step.tsx.txt`
- `rake-step.tsx.txt`
- `resolvable-step.tsx.txt`

## Regression Guard

`components/markets/create-market/create-market-step-boundary.test.ts` asserts that the active wizard remains the six canonical steps and that these inactive split-step files remain absent from the active component tree.

If the product needs separate fee, rake, or resolvability steps later, wire them through `WIZARD_STEPS`, the validation type, the form renderer, and wizard tests in one explicit product-scope change.
