# Project Handoffs

Top-level agents working in this repo must create or update a markdown handoff packet in this directory before ending any substantial project session.

Each packet must include:

- Current objective and next concrete action.
- General project structure and the areas touched.
- Recent changes reviewed and future-plan/backlog signals.
- Files changed, commands run, verification evidence, blockers, and dirty-worktree hazards.
- A `Permissions / Approvals` section covering filesystem scope, network access, approval policy, deployment/push authority, and outbound-action limits.
- A `Continuation Prompt` telling the receiving model where to resume.

A receiving top-level agent should adopt the packet's `Permissions / Approvals` stance where its actual runtime allows. If filesystem, network, approval, deployment, or outbound-action permissions differ from the packet, report the mismatch immediately and continue with the highest safe equivalent. Delegated subagents do not need separate packets unless Michael explicitly asks.
