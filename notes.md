# Notes (Mistakes + Prevention)

## 1) Do Not Add Visual Fallbacks
- Mistake:
  - I allowed/introduced a visually different "fallback" render path on the landing experience.
  - You explicitly do not want any alternate landing/logo to render "while loading" or "if slow".
- Rule going forward:
  - The landing page must either render the real, correct experience or render nothing (or a strictly non-visual loading state), but never a different-looking logo/page.
- Prevention:
  - Do not ship any "fallback markup" that can become visible.
  - Fix the root cause (asset hosting, module loading, renderer selection) instead of hiding it with a fallback UI.

## 2) Do Not Make Unrequested Visual Changes While Debugging
- Mistake:
  - I changed placement/alignment of existing visuals (example: "BET ON REALITY") while trying to fix an unrelated artifact.
- Rule going forward:
  - Debug changes must be minimal and scoped to the exact issue.
  - If I must make an experiment, it must not be committed/deployed unless you asked for it.
- Prevention:
  - Use a scratch branch or local-only experiment, then revert before committing.
  - Before pushing, re-check the exact UI elements you care about (logo placement, hero layout, CTA placement).

## 3) Never Ship Multiple Unrelated UI Fixes in One Deploy
- Mistake:
  - I bundled changes that were not all required to fix the bug at hand.
- Rule going forward:
  - One focused commit per deploy (per `AGENTS.md`), and only for the requested feature/fix.
- Prevention:
  - If I notice a second issue while working, I will log it here (or `docs/CHANGE_HISTORY.md`) and ship it in the next deploy.

## 4) Confirm "Back To Landing" Behavior With Real Navigation
- Mistake:
  - I relied on client-side transitions where you needed a full document reload.
- Rule going forward:
  - Any "Back to landing" must do a full navigation to `/` (hard reload) when you ask for it.
- Prevention:
  - Prefer `<a href="/">` over Next `<Link>` when the requirement is explicitly "full reload".
  - Validate using a real browser flow (navigate to `/login` then hit browser back + click logo).

