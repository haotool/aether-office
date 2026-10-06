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
| Routes without a session     | `GET /health`, `POST /api/login`, `POST /api/pairings/redeem`, `POST /api/runner/enroll`, the GitHub webhook (HMAC signature), the A2A card and `/a2a` (its own bearer scheme) and the three approval-hook routes, each with its own credential. The list is one constant (`PUBLIC_ROUTES`), and a test sweeps every registered route and fails if one that is not on it answers an unauthenticated caller or another project's credential. |
| Outbound requests            | Connectors and A2A artifact fetches go through a guard that blocks private and metadata addresses, pins the connection to the validated address, revalidates redirects and bounds time and size. |
| Pairing a phone              | A QR code carries a 128-bit one-time code in the URL fragment (never the query: no server log, no Referer). The server keeps only its hash, accepts it once within five minutes, answers alike for an unknown, used or expired code, limits the codes waiting at a time (one per request, however many network addresses the computer has: the links differ only by host), and the page removes it from the address bar and swaps it for a new session (never reusing one from before sign-in). The person who made it sees whether it was used. |
| Speech bubbles               | `GET /api/local-sessions/speech` returns the last prompt and the last reply (each at most 400 characters, with times) of every running local session, so the office can show them over the members' heads. It exposes conversation text, so it is for owner and operator only (like the transcript route), reads only the tail of a transcript opened through a key the scanner found, redacts secret patterns, answers at most 40 sessions, and keeps nothing but an in-memory cache keyed by file mtime and size. Off with `AETHER_LOCAL_SESSIONS=off`. |
| Context and compaction numbers | `GET /api/local-sessions` also carries, per session, `usage.contextPct` (a share of the model's window, 0 to 100) and `usage.compactedAt` (the time of the CLI's own compaction marker in the transcript tail), next to the token counts it already returned. Both are numbers: the marker is found as bytes in the tail and only its timestamp is read, no transcript text is parsed, kept or returned, and the existing tail bound and mtime and size cache apply. The model catalog used for the window is read from the CLIs' own caches, never written. |
| Session change stream        | `GET /api/local-sessions/stream` (server-sent events) tells the page which local session changed and in what way (state, tool, speech, transcript). It carries the session key, the kinds of change and a sequence number, nothing else: the content is only ever returned by the polling endpoints, with their redaction. Owner and operator humans only (agents, runners, reviewers and viewers get 403, anonymous 401); 404 with `AETHER_LOCAL_SESSIONS=off`. Bounded: 16 open streams (429 beyond), a slow client is dropped at 64 KB unsent, replay is capped at 256 events, a heartbeat every 20 s. Every open stream re-authenticates the exact credential every two seconds and ends with a `fault` event on logout, revocation or a role change, and it closes on server shutdown. The stream response carries the same security headers as any other. The three heavy reads (`/api/local-sessions`, `/speech`, one transcript) are answered `private, no-cache` with a weak ETag instead of `no-store`, so the browser keeps its own copy of the redacted answer and revalidates it (a `304` has no body); on a shared device, sign out and clear site data. |
| Session composer endpoints   | `GET /api/local-sessions/:key/{terminal,commands,files}` are for owner and operator (like the transcript route). The session is chosen by a key the scanner found (a strict pattern); its directory and process are looked up on the server and never taken from the request. `commands` returns names and one-line descriptions (at most 140 characters, secret patterns redacted, 200 entries) of `.claude/commands/*.md` and `.claude/skills/*/SKILL.md` in the session's directory and the user's Claude folder: links are not followed in `commands`, a skill folder may be a link but only its `SKILL.md` head (2 KB) is read. `files` lists what `git ls-files` reports for the session's directory (ignored files skipped, 4 MB and 3 s bound, 20 results, query at most 100 characters and used only as a filter, never as a path; `.env*`, key and certificate files are never offered); a directory that is not a Git work tree yields nothing. `terminal` answers only for terminals of projects the caller may open. A browser send is an ordinary `terminal.input` under the terminal lease and role checks; the body is stripped of control characters so pasted text cannot end the paste or inject keys. `terminal.start` with `resume` takes a provider and a session id that cannot start with a dash, and the runner honours it only for a profile that is exactly the provider's own binary with no arguments. |
| Git history and health       | `git-graph` (150 commits; subjects cut to 160 and author names to 80 characters, secret patterns redacted) and `git-health` are readable by any role that may read the project and only look at the project's own repository. Removing worktrees (`git-health/clean`) is owner only, takes worktree paths and re-checks each is merged and clean, never forces, does nothing when the process list cannot prove that no agent is working inside, and is audited. |
| Model catalog                | `GET /api/models` (any signed-in role) reads the CLIs' own cache files, bounded to 2 MiB each, and runs `codex debug models` without a shell and with a timeout when the Codex cache is old. It writes nothing under `~/.claude` or `~/.codex`, makes no network request and reads no account identifier. |
| Secrets                      | Tokens are never written to events, logs or URLs; token files are mode 0600. Redaction (`redactSecrets`) is a best-effort filter for text shown in the UI: it covers known token formats (GitHub, GitLab, OpenAI-style `sk-`, Slack, AWS access key ids, Google API keys, JWTs, `Bearer` values, private-key blocks), credentials in URLs, and any assignment whose name contains token, secret, password, passwd, api key, account key or private key, whether `name=value`, `NAME: value`, `export MY_TOKEN=...` (including `AWS_SECRET_ACCESS_KEY` and `PGPASSWORD`) or JSON `"password": "..."`; structured tool input is also redacted by key name. It cannot recognise a secret that has no known format and no telling name, and paths are kept on purpose. |

## Safety properties

- **No permission bypass.** There is no mode that skips provider approvals, and no automatic switch to a paid API.
- **Per-call approvals.** A tool approval binds to one request, session and parameter hash, and AETHER never turns on
  session-wide auto-approval by itself. The one exception is the opt-in "Allow for this session" of Remote approvals (below):
  an explicit click that echoes back a rule Claude Code itself offered, which Claude Code then applies for that session.
  "Provider acknowledged" is recorded only when the provider's own tool event arrives.
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
- **Remote approvals are opt-in and never decide by themselves.** Off by default. An owner switches them on
  (`PUT /api/remote-approvals`), which issues a random hook token (only its SHA-256 is stored here) and a random
  `verifyKey`, and writes both to `~/.aether/approvals.json` (`AETHER_APPROVALS_CONFIG` overrides). The file is written
  atomically under a fresh name, mode 0600, in a `~/.aether` that is chmod 0700 even if it existed; a symlinked file or
  directory is refused. Switching off deletes the file (token and key with it); switching on again rotates both.
  - _The hook._ `pnpm hooks install --remote-approvals` copies the hook and its one helper into `~/.aether/hooks/` (directory
    0700, files 0500, written atomically) and points Claude's settings at that copy, because a worktree is writable by the
    very agent the hook gates. `pnpm hooks status` compares the copy with the repository's source by SHA-256 and reports
    `modified` when they differ; installing again restores it. This stops an agent from editing the hook with its tool
    calls; it does not stop another process running as you (see the last paragraph). The settings file is written through a
    symlink, so a dotfiles link survives.
  - _Who is who._ The hook posts the tool call to `POST /api/hook/permission-requests` with the token. The token is not an
    identity: it can create a request and read or close a request whose (random) id it knows, nothing else (it cannot list
    requests, decide, or call any other route), and it stops working the moment Remote approvals is switched off. The hook
    routes answer only a loopback caller (127.0.0.0/8, `::1`, `::ffff:127.*`: 403 otherwise). The token is compared first; a
    wrong one counts against a per-address limit like a login (10 per 5 minutes, then 429), a right one is never counted or
    locked out, and the counter map is pruned every second and capped at 1000 entries.
  - _The server proves its answers._ The hook only ever connects to the loopback URL in its file and never follows a
    redirect, but any local process could listen on that port while AETHER is down. So a decision counts only with a
    `proof` = HMAC-SHA256(`verifyKey`, `requestId|nonce|behavior|sessionRulesFlag`), where `nonce` is a fresh random value the hook
    sent with that request; the key is never sent by the hook. The hook checks it in constant time and treats a missing or
    wrong proof as no decision (it prints nothing and Claude asks in the terminal). A squatter therefore cannot answer for you.
    It can still read the hook token the hook sends it, which only works against the real server, from this machine.
  - _Who decides._ Only a human owner or operator at a browser session: `GET /api/permission-requests` and
    `POST /api/permission-requests/:id/decision` need the session cookie (with the CSRF token on the decision) and refuse any
    request that carries an `Authorization` header (403), so an agent that reads `.data/live/owner-token` cannot approve its own
    request. Agents, runners, viewers and reviewers are refused too. The same answer twice is idempotent, a different one is `409`.
    The decision is also refused (403) on a connection that is neither loopback nor HTTPS, because a decision rides on a
    session cookie that plain HTTP does not protect. **Tradeoff, stated plainly:** with the default settings a phone on the
    same Wi-Fi opening AETHER over `http://192.168.x.x` can see requests but cannot answer them. To answer from a phone, put
    AETHER behind HTTPS (for example a Tailscale tunnel) or set `AETHER_REMOTE_APPROVALS_LAN=1`, which allows it over plain HTTP
    and accepts that anyone who can read that traffic on the network can take the session cookie. Settings -> Remote approvals
    says which case the page is in.
  - _What a person sees._ Requests are in memory only, bounded (20 pending, 5 per session, 60 created per minute, checked
    before the project lookup; 100 remembered, closed ones forgotten after 5 minutes), and a session must belong to a project.
    The summary is built on the server from the tool input: hidden and bidirectional control characters and zero-width characters
    are removed, then secrets are redacted (including by key name in structured input), then it is cut to 140 characters (summary)
    and 1200 (preview). The raw input is never stored or sent on, and the audit event of a decision carries the tool and answer
    but not the command. The preview shows the command before the agent's own description, every edit of a `MultiEdit` and
    `replace_all`. The compact card (feed row, phone sheet) shows only the summary line, so when the call is multi-line, cut
    short or a change, it offers Review (which opens the full preview) and Deny, never Allow.
  - _Allow for this session._ It only echoes back the rules Claude itself offered in `permission_suggestions` (pinned to the
    `session` destination), never a rule AETHER invents, and the hook offers it only when there are at most 3 rules of at most
    120 characters each, so the label the person reads is the whole rule. It is a session-wide rule that Claude Code applies
    afterwards without asking; it exists only on that explicit click.
  - _Cost._ While the hook waits (45 s by default) the terminal prompt is not shown; if nobody answers it appears after that
    delay. At the deadline the hook closes its request, so a late click is refused rather than answering a prompt that is
    already on the terminal.
  - _What it does not defend against._ Any process running as your user can read `~/.aether/approvals.json` (so it can post
    requests, and with the key it could forge a proof), replace the installed hook, or edit Claude's settings. This is the
    same trust as your other files in your home directory: Remote approvals is a convenience for answering your own prompts, not a
    boundary against code that already runs as you.
- **Process identity is `pid` plus start time**, never a name or command line, so a recycled pid is never signalled.
- **Uncertain work is not retried.** A lost runner moves in-flight work to `indeterminate`; terminal input is not re-sent
  after a restart.
- **Review and acceptance are bound to a commit.** A verifier runs a trusted, hash-pinned program against a fixed SHA;
  an agent cannot approve its own work; accepting a result is a human decision and never merges or pushes by itself.
- **Nothing leaves the machine unless asked.** No remote push, publication or telemetry; connectors and A2A are opt-in.

## The service worker

The web app registers a small service worker (`apps/web/src/sw`), only in a secure context (https, `localhost`,
`127.0.0.1`), never in development, and not when the browser blocks it. It exists so that a page left open while the server is
rebuilt still finds its scripts, and so that the page can ask before it updates.

- **What it caches:** `index.html` and the hashed scripts and styles under `/assets/` (named by `scripts/sw-precache.ts` at
  build time), in one cache named for a hash of those files. Old caches are deleted when a new version takes over.
- **What it never caches or touches:** anything under `/api/` (sessions, transcripts, tokens, the event stream), `/health`, the
  characters, icons, any request that is not a `GET`, any other origin. These requests do not enter the worker's fetch
  handling at all, so no session data is stored on the device by it (`tests/aether/pwa.test.ts` and `e2e/pwa.spec.ts` check
  the rules and the stored keys).
- **Updates:** a new worker waits; the page shows "A new version is ready" and takes it over only when the person taps
  Reload (`skipWaiting` is never called on its own).
- **Kill switch:** `?sw=off` unregisters the worker and deletes its caches on that browser, and keeps it off (`?sw=on` undoes it).

## Hardening checklist for a LAN deployment

1. Use a network you trust, or terminate TLS in front (for example a Tailscale tunnel; see
   [Install it on a phone](getting-started.md#install-it-on-a-phone)).
2. Keep the owner token out of chats, screenshots, issues and shell history.
3. Enroll runners with one-time invitations and revoke machines you no longer use.
4. Leave `AETHER_A2A` off unless you need it.
5. Install hooks per project, not per user, unless you want every session on the machine observed.
6. Leave Remote approvals off unless you want to answer prompts from a browser; if you answer from a phone, use HTTPS rather
   than `AETHER_REMOTE_APPROVALS_LAN=1`.

## Verification

The authorization matrix, host policy, CSRF, secret hygiene, SSRF guard and unsafe-HTML rules each have tests
(`security`, `lan-access`, `secret-hygiene` and `safe-fetch` under `tests/aether/`, among others) that run with
`pnpm test`; `pnpm lint` enforces the static rules. The per-capability status is in the
[verification ledger](verification/report.md).
