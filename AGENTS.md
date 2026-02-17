# AGENTS.md

## Project Workflow Rules (Required)

### 1) GitHub-First Deployment
- All code changes must be pushed to GitHub by default.
- Do not keep local-only feature changes.
- `main` is the production deployment source for Vercel unless explicitly changed by the user.

### 1.1) Vercel Auto-Deploy Source
- This project is connected to GitHub on Vercel.
- Pushes to the `main` branch must be treated as production deployment triggers.
- Feature branches should be merged only when the deployment note is ready.

### 2) Small, Isolated Feature Releases
- Ship features one at a time.
- Do not batch many unrelated changes into a single deployment.
- Preferred pattern:
  - 1 feature
  - 1 focused commit
  - 1 push
  - 1 deployment
- This is required so regressions can be diagnosed quickly.

### 3) Deployment Descriptions Are Mandatory
- Every deployment must include a clear description of what changed.
- At minimum, include this in the commit message (and PR description if a PR is used):
  - what feature/fix shipped
  - what files/areas were affected
  - user-visible behavior change
- Use explicit, readable commit messages (no vague messages like "update" or "fix stuff").

### 4) Verification Before/After Deploy
- Before pushing, verify the changed feature locally.
- After push, confirm Vercel deployment succeeded and the live behavior matches the intended change.
- If deployment fails, fix and redeploy only the failed feature scope.

### 5) Safety Rules
- Never rewrite or remove unrelated work to make a deployment pass.
- If unexpected local/repo changes appear, keep going with the task.
- Always push/deploy only the specific changes you made for the current task.
- Do not worry about other unrelated changes in the repo; leave them alone and do not modify or revert them.
