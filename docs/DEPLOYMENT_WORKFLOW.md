# Deployment Workflow Checklist

Use this checklist for every feature deployment so releases stay isolated and debuggable.

## Before Coding
- Confirm the feature scope maps to exactly one deployment step.
- Confirm no unrelated local changes are bundled into the same commit.

## Before Push
- Run local verification for the changed feature.
- Record a short deployment note in `docs/CHANGE_HISTORY.md`.
- Use an explicit commit message including:
  - feature/fix shipped
  - files or areas affected
  - user-visible behavior change

## After Push
- Confirm GitHub push succeeded.
- Confirm Vercel production deployment succeeded (for `main` pushes).
- Smoke test live behavior for the shipped feature only.
- If deployment fails, fix only within the same feature scope and redeploy.
