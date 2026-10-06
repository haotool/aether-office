# Security

This document describes the threat model, the trust boundaries and the safety properties AETHER OFFICE maintains.
To report a vulnerability, see [SECURITY.md](../SECURITY.md).

## Threat model

AETHER OFFICE is built for **a single trusted operator on their own machine or network**. It coordinates coding agents
that already run with that operator's privileges, so it focuses on:

- keeping the control plane from being driven by anyone else (another website in the operator's browser, another host on
  the network, a compromised agent);
- keeping untrusted content (agent output, messages, transcripts, third-party payloads) from becoming code, markup or
  authority;
- making every consequential action explicit, attributable and recoverable.

It does **not** provide hostile multi-tenant isolation. A Git worktree isolates work, not a process: an agent still has the
local user's file permissions. Strong sandboxing of agents is outside the intended deployment model.

## Trust boundaries

| Boundary                     | Rule                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Network                      | Binds to loopback by default. `AETHER_HOST` opens it to the local network, where requests must be addressed to a private-network address on the same port (blocks DNS rebinding). Plain HTTP: the token is not encrypted in transit on a LAN. |
| Browser ↔ control plane      | HttpOnly session cookies, CSRF tokens on every mutation, Origin and Host checks, rate-limited failed logins. The owner token is never embedded in the web bundle or a URL. |
| Identity and authorization   | A command's actor comes from authentication, never from the payload. Roles (`owner`, `operator`, `reviewer`, `viewer`, `agent`, `runner`) map to actions in one matrix (`packages/kernel`) pinned by a test so privilege cannot grow silently. |
| Control plane ↔ runner       | The runner authenticates with its own scoped token, claims jobs and reports results; it has no access to the control database. A revoked machine stops being served at once. |
| Agent ↔ platform             | Agents reach the platform only through MCP tools with a credential scoped to one run, one agent and one project, which expires with the run. Peer messages are untrusted text and can authorize nothing. |
| Untrusted content ↔ UI       | Messages, transcripts, terminal output and provider payloads are rendered as text. The web app uses no `dangerouslySetInnerHTML`, `innerHTML`, `eval` or terminal clipboard/link add-ons (checked by `pnpm lint`). |
| Outbound requests            | Connectors and A2A artifact fetches go through a guard that blocks private and metadata addresses, pins the connection to the validated address, revalidates redirects and bounds time and size. |
| Pairing a phone              | A QR code carries a 128-bit one-time code in the URL fragment (never the query: no server log, no Referer). The server keeps only its hash, accepts it once within five minutes, answers alike for an unknown, used or expired code, limits the codes waiting at a time (one per request, however many network addresses the computer has: the links differ only by host), and the page removes it from the address bar and swaps it for a new session (never reusing one from before sign-in). The person who made it sees whether it was used. |
| Speech bubbles               | `GET /api/local-sessions/speech` returns the last prompt and the last reply (each at most 400 characters, with times) of every running local session, so the office can show them over the members' heads. It exposes conversation text, so it is for owner and operator only (like the transcript route), reads only the tail of a transcript opened through a key the scanner found, redacts secret patterns, answers at most 40 sessions, and keeps nothing but an in-memory cache keyed by file mtime and size. Off with `AETHER_LOCAL_SESSIONS=off`. |
| Secrets                      | Tokens are never written to events, logs or URLs; known secret patterns are redacted from transcript text shown in the UI; token files are mode 0600.             |

## Safety properties

- **No permission bypass.** There is no mode that skips provider approvals, and no automatic switch to a paid API.
- **Per-call approvals.** A tool approval binds to one request, session and parameter hash. Session-wide auto-approval is
  refused. "Provider acknowledged" is recorded only when the provider's own tool event arrives.
- **Observation is read-only.** Sessions the operator starts are shown, never controlled, unless the operator explicitly
  stops one (owner only, identity re-checked immediately before a single `SIGTERM`).
- **Clock out ends processes in bulk, with the same guards.** `POST /api/local-sessions/clock-out` (owner only, an
  `Idempotency-Key` required, at most 50 sessions) takes session keys and the process start time the person saw, never a
  pid. For each one the server re-scans and decides on its own clock: the session must still be running, be the same
  process, be dormant or orphaned and idle at least the requested time (never less than one day), belong to a project the
  owner may configure, and not be this server or an ancestor of it; otherwise it is skipped with a reason (`active`,
  `changed`, ...). A process gets `SIGTERM`, then `SIGKILL` after 5 s if it ignored it (re-checking pid and start time
  before each), and counts as cleared only once it is really gone. Only that one process is signalled (its children are
  not); transcripts are never deleted. Up to four run at once; every session gets its own result; an audit event
  `local-session.clock-out.requested` is written per project.
- **Process identity is `pid` plus start time**, never a name or command line, so a recycled pid is never signalled.
- **Uncertain work is not retried.** A lost runner moves in-flight work to `indeterminate`; terminal input is not re-sent
  after a restart.
- **Review and acceptance are bound to a commit.** A verifier runs a trusted, hash-pinned program against a fixed SHA;
  an agent cannot approve its own work; accepting a result is a human decision and never merges or pushes by itself.
- **Nothing leaves the machine unless asked.** No remote push, publication or telemetry; connectors and A2A are opt-in.

## Hardening checklist for a LAN deployment

1. Use a network you trust, or terminate TLS in front (for example a Tailscale tunnel).
2. Keep the owner token out of chats, screenshots, issues and shell history.
3. Enroll runners with one-time invitations and revoke machines you no longer use.
4. Leave `AETHER_A2A` off unless you need it.
5. Install hooks per project, not per user, unless you want every session on the machine observed.

## Verification

The authorization matrix, host policy, CSRF, secret hygiene, SSRF guard and unsafe-HTML rules each have tests
(`security`, `lan-access`, `secret-hygiene` and `safe-fetch` under `tests/aether/`, among others) that run with
`pnpm test`; `pnpm lint` enforces the static rules. The per-capability status is in the
[verification ledger](verification/report.md).
