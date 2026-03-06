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

### 1.2) Main-Only Deploy Preference
- Always deploy by pushing changes directly to `main` unless the user explicitly asks for a non-`main` branch workflow.
- Do not default to feature-branch-first deployment for this project.

### 1.3) Confirmed Platform Access (Do Not Forget)
- Assume full operational access to project tooling in this workspace (Supabase, Vercel, GitHub) unless a command explicitly fails.
- Never claim missing access without first running verification commands.
- Verification commands:
  - `supabase projects list`
  - `vercel ls`
  - `git remote -v`
  - `gh auth status` (when GitHub CLI actions are needed)

### 1.4) Supabase Access + Edit Workflow
- Supabase project ref for this app: `ynuyfchtajpmnbcpbagb` (`theres-no-chance`).
- Preferred wrapper: `npm run supabase -- <args>` or `bash scripts/supabase-safe.sh <args>`.
- Link workspace to project: `npm run supabase:link`.
- Check local vs remote migration state: `npm run supabase:migration:list`.
- Apply schema changes to remote: `npm run supabase:db:push`.
- If migration history drifts, repair explicitly:
  - `npm run supabase -- migration repair --linked --status reverted <version> --yes`
  - `npm run supabase -- migration repair --linked --status applied <version> --yes`
- Keep multiline secrets out of `.env.supabase.local`; the wrapper temporarily swaps that CLI-safe file in as `.env` while Supabase runs.

### 1.5) Vercel Access + Deploy Workflow
- Main branch pushes are production deploy triggers; treat every `git push origin main` as a live deploy.
- Check deployment queue/state: `vercel ls`.
- Inspect a deployment: `vercel inspect <deployment-url>`.
- Confirm production reaches `Ready` after each push.

### 1.6) GitHub Access + Change Workflow
- Default delivery path is direct push to `main` for this project unless user explicitly requests otherwise.
- Push command: `git push origin main`.
- Use GitHub CLI (`gh`) for PR/issues/review tasks when requested.

### 1.7) Security Handling for Tooling
- Never print or expose secrets (tokens, API keys, private keys) in logs or summaries.
- Use existing local auth/session state and environment variables without echoing sensitive values.

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
- This workspace may have multiple coding agents working concurrently; expect frequent file changes you did not make.
- Always push/deploy only the specific changes you made for the current task.
- Do not worry about other unrelated changes in the repo; leave them alone and do not modify or revert them.
