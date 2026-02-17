# Notes: Mistakes and How To Avoid Them

## Purpose
This file records mistakes that caused user frustration and the exact behavior rules to prevent repeats.

## Mistake 1: Ignored explicit product direction on fallback rendering
What happened:
- User explicitly said they did not want fallback text/alternate hero rendering.
- I still introduced and iterated on fallback UI.

Why this was wrong:
- It violated a direct product requirement and changed brand presentation.

Never again rule:
- If user says "no fallback," do not add fallback UI, fallback copy, fallback styles, fallback mode toggles, or fallback badges.
- Only work on improving the primary path.

Process guard:
- Before committing UI changes, compare final diff against user constraints and run this check:
  - "Did I introduce any alternate visual mode the user explicitly disallowed?"

## Mistake 2: Expanded scope beyond the asked question
What happened:
- User asked whether a specific update guaranteed cross-device accessibility.
- I moved into implementation changes before giving a direct, constrained answer.

Why this was wrong:
- It delayed the direct answer and reduced trust.

Never again rule:
- First answer the exact question directly and clearly.
- Then propose or execute changes only if requested.

Process guard:
- Start responses with:
  - "Direct answer"
  - "What this means"
  - "Next action (only if requested)"

## Mistake 3: Introduced visual regressions while trying to improve resilience
What happened:
- Changes meant to improve reliability changed visual behavior in ways user did not approve.

Why this was wrong:
- Reliability fixes must preserve canonical visual output unless user requests redesign.

Never again rule:
- For branding-critical UI, treat visual parity as a hard requirement.
- If a reliability fix risks visual drift, pause and present options first.

Process guard:
- Add a release check for brand-critical pages:
  - "Primary hero visuals unchanged"
  - "No alternate brand rendering path"

## Mistake 4: Did not treat user anger as a failure signal early enough
What happened:
- I continued iterating instead of immediately resetting to user-specified constraints.

Why this was wrong:
- User frustration indicates requirement mismatch that must be corrected immediately.

Never again rule:
- If user is upset, stop feature expansion.
- Re-state requirement, revert conflicting behavior, and ship the constrained fix first.

Process guard:
- When user expresses frustration:
  - acknowledge constraint breach
  - remove conflicting behavior
  - provide short verification summary
