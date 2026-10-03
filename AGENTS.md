# AETHER OFFICE

- Full scope: `docs/MASTER_SPEC.md`; active decisions: `docs/decisions/`.
- Latest user instruction supersedes the historical 0.3 input requirement: start from a freshly verified open-source clone. Work independently; do not delegate.
- Upstream AgentSystemLabs/agent-office is MIT; retain attribution. Its former CLAUDE publishing instructions do not authorize remote changes.
- No paid model runs, push, remote PR, auto-merge, global configuration edits, or permission bypass without explicit authorization.
- Protect user data. Demo, fixtures, observed, replay and live evidence stay distinct.
- Target: apps/{control,runner,web,cli}, packages/{contracts,kernel,providers,office-scene}. Kernel has no transport/DB/UI dependencies. Runner never writes the canonical control DB.
- Track implementation and verification separately in `docs/FEATURES.json`; log actual checks under `evidence/`.
- Current upstream baseline: `npm test`, `npm run typecheck`, `npm run build`. New workspace commands become authoritative only once implemented.
- Before ending an iteration update `docs/PROGRESS.md` with exact next actions and failures. Never claim production readiness from build success.
