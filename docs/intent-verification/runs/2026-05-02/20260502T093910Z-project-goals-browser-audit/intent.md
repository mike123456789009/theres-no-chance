BEST ESTIMATE STATEMENT OF USER INTENT

Primary goal:
Audit the `theres-no-chance` project by understanding what the product is meant to do, identifying its core functionality requirements, exercising those requirements on the actual deployed website through Browser Use, and reporting the findings back clearly.

Explicit requests:
1. Look through the project.
2. Identify the project's goals.
3. Identify the project's core functionality requirements.
4. Test those goals and requirements using Browser Use.
5. Keep track of the findings and evidence.
6. Return with a summary of what was found.
7. Use the intent-verification gate.
8. Use the actual website/production deployment for browser testing, not just localhost.

Implied constraints:
- Use the repository itself as the primary source of truth for product goals and requirements.
- Prefer actual production runtime/browser behavior over code-only or localhost-only claims.
- Produce an audit/report rather than making feature changes unless testing uncovers a blocker that must be documented.
- Keep durable artifacts for the gate run.

Non-goals:
- Do not deploy or push changes unless explicitly requested.
- Do not redesign or refactor the app as part of this audit.
- Do not submit sensitive or production-impacting data through the UI.

Risk of misinterpretation:
- Phrase: "test them using browser use"
  Chosen interpretation: drive the deployed website through the Browser Use plugin and verify visible browser behavior against the inferred product requirements.
- Phrase: "actual website"
  Chosen interpretation: test the current Vercel production URL or canonical deployed website surface, not only the local dev server.
- Phrase: "come back and tell me what you have found"
  Chosen interpretation: provide a concise findings report with requirements, test coverage, pass/fail notes, and known gaps.
