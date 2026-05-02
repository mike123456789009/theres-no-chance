BEST ESTIMATE STATEMENT OF USER INTENT

Primary goal:
Implement the planned market maker and no-action auto-retirement upgrade so production market supply comes from the current market maker pipeline, dead closed markets are automatically finalized as void when they have no trades or resolver bonds, admin users can see operational health, and public discovery/detail surfaces use clearer lifecycle messaging.

Explicit requests:
1. Implement the supplied plan, not just discuss it.
2. Use the existing market maker setup instead of adding fake/demo open markets.
3. Fix the local build/type drift first by resolving the stale `lib/markets/read-markets.ts` shadow module.
4. Add an admin-only market operations health panel to `/account/admin/market-maker`.
5. Add a Supabase no-action retirement RPC without adding a new market status enum.
6. Call the retirement RPC from the community-resolution sync automation and include `noActionMarketsRetired` in the response.
7. Extend discovery DTOs and UI to show richer lifecycle labels.
8. Improve no-results empty states for open-market filters with recovery CTAs.
9. Add tests for lifecycle labels, no-action detection, discovery card retired labels, empty-state CTAs, and cron response behavior.
10. Run required quality gates and deploy to production, verifying Vercel Ready and live behavior at `https://theres-no-chance.com`.
11. Use the intent-verification gate.

Implied constraints:
- Keep changes tightly aligned to existing Next.js/Supabase patterns.
- Preserve current admin actions and current market maker workflow.
- Avoid exposing secrets, raw env values, private URLs, or unnecessary user details.
- Respect existing dirty worktree changes and only touch plan-relevant files.
- Use normal settlement/audit machinery for retirement so accounting is not bypassed.
- Treat `main` push as production deployment.

Non-goals:
- Do not add a fake open market demo lane.
- Do not add a public status page.
- Do not introduce a new market status enum.
- Do not submit browser forms or use real credentials unless provided.

Risk of misinterpretation:
- Phrase: "automatically retired"
  Chosen interpretation: finalized as `void` with `void_reason = 'no_activity_at_close'`, using existing finalization/settlement/audit path where practical.
- Phrase: "Meaningful action"
  Chosen interpretation: at least one `trade_fills` row or at least one `market_resolver_bonds` row prevents no-action retirement.
- Phrase: "admin-only production/system health"
  Chosen interpretation: add health information to `/account/admin/market-maker`; no public `/status` page.
