# How a session gets its role

Every observed Claude Code or Codex session is given one of 18 engineering roles, grouped into five departments (one floor
each, see `packages/kernel/src/departments.ts`). The role decides the floor, the label, the screen and the Sessions filter.
One server-side result feeds all of them; the web app never classifies an observed session itself.

**No model is ever asked.** The classifier is a pure, deterministic heuristic over data already on disk or in memory: the
transcript's tail, the hook spool, and Git and process metadata read with read-only commands. It makes no model, API or
network call, starts no `claude` or `codex` process and has no optional switch for one.
`tests/aether/classify-session.test.ts` fails if the classifier or anything it imports reaches `child_process`, the
network or a provider SDK.

## Flow

```
 transcript tail ─────► session-work.ts ──► last 40 tool calls (tool + file / command / subagent type)
 hook spool (recent) ─┘ (fallback when the transcript shows none)
 provider title (ai-title / thread name) ─┐
 latest prompt (Claude) / first prompt (Codex), 400 chars ─┤
 git branch, repository name ─┤                    kernel/classify-session.ts
 running subagent types ──────┴──► session-role.ts ──► scoreSession ──► settle ──► LocalSession.classification
                                   (per-session memory)  (weighted points)  (hysteresis)   {role, department,
                                                                                            confidence, evidence[]}
                                                            │
        ┌───────────────────────────┬───────────────────────┴───────────┬─────────────────────┐
   floorResolver              roleResolver                          Sessions list /      SessionDetails
   (floor of the department)  (screen; a subagent works as its      department filter     ("Role · 82% ·
        │                      type says, else as its parent)                              because: …")
   mergeLayout: a desk already saved in the layout is never moved; only unplaced members use the new floor
```

## Scoring

Every signal adds weighted points to the roles it points at (`packages/kernel/src/role-signals.ts`); each source can carry a
role only so far (4 points, activity 6), so one noisy source cannot decide alone.

| Signal                  | Source                                                                                                  | Weight                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| What it did             | file kinds it edited (`tests/`, `db/migrations/`, `.github/workflows`, `*.tsx`, `ios/` …), commands it ran (`docker`, `psql`, `gh pr`, `xcodebuild` …), special tools (plan mode, Figma, ticket trackers, monitoring) | 0.25 to 1.5 per call; reads count a quarter; read-only exploration counts for research |
| Title                   | the provider's own session title, English and Traditional Chinese keywords                              | 2 per strong word, 1 per shared word             |
| Prompt                  | the task text: first 120 characters at 0.8, the rest at 0.4                                             | as above; several different words count up to 2x |
| Branch, repository      | branch words (`fix/api-…`, `docs/…`, `chore/ci`), repository name                                       | 1.0 for the branch, 0.5 for the repository       |
| Subagents               | running types (`Explore` research, `Plan` architect, `code-reviewer` review, `security-reviewer`, `tdd-guide` qa …), `Task` delegations | 1.5 (0.5 for Explore, Plan), capped at 3 |
| Frontend and backend    | both at 3+ points and within 60% of each other                                                          | becomes full-stack                               |
| Provider, model         | none: measured to add no accuracy, so they are not used                                                 | 0                                                |

Confidence is `top / (top + runner-up + 1)`. A role wins only with at least 1.5 points and 0.4 confidence; otherwise the
session is a **generalist** (Software Engineer, Product Engineering floor) rather than a wrong department, and its
evidence says "no clear signal".

## Stability

`settle` keeps the role a session already has until a different one has been ahead on 3 separate looks at least 15 seconds
apart, and between two specialities by 1.5 points. The decision is remembered per session in server memory. A saved
layout always wins: `mergeLayout` never moves a member that already has a desk, so a changed mind only places members
that are not yet seated. There is no separate override control; moving a desk in the layout editor is the override.

## Evidence and privacy

`classification.evidence` holds at most five strings of at most 80 characters, `kind: detail`, passed through
`redactSecrets`: a matched keyword (`prompt: api`), or a label of the kind of file or command (`edits: database files ×4`,
`runs: test runs`). Prompt text, paths and commands are used in memory to decide and are never returned.

## Measured accuracy

Corpus: 93 synthetic labelled cases (`tests/aether/fixtures/session-corpus.ts`) over every role, plus the headless, subagent,
thin-signal and no-signal cases. Real sessions: the 66 on the development machine, 50 labelled by hand from anonymised
signals (tool mix, file kinds, command names), the rest ambiguous and left out.

| Set                       | Old (first matching keyword in title, prompt, branch) | New    |
| ------------------------- | ------------------------------------------------------ | ------ |
| Synthetic corpus, 93 cases | 84.9% roles                                            | 100% roles and departments |
| Real sessions, 50 labelled | 48%                                                    | 90%    |

The synthetic corpus was written alongside the vocabulary, so its 100% is a regression guard, not a forecast; the real set
is the honest number, and its labels carry the labeller's judgement. The test requires at least 90% overall and 80%
precision for every role.
