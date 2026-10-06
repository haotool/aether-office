# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it has a stable release.

## [Unreleased]

Pre-release development (`0.4.0-dev`).

### Upgrade notes

- **Restart the control plane after upgrading.** The running server keeps the code it started with and answers an updated
  page in the older shape until it is restarted.
- **Re-enable Remote approvals and reinstall the hook** (Settings → Notifications & approvals, off and on, then
  `pnpm hooks install --remote-approvals`). The configuration file now also holds a `verifyKey`; with an older file the hook falls
  back to Claude's terminal prompt.
- **Run `pnpm hooks install` again** (for each project or scope you installed it in) to also record failed tool calls: Claude
  Code reports them as `PostToolUseFailure`, which `pnpm hooks status` lists as missing until then. Until you do, a failed call is
  "not known" unless the session's transcript says so.
- **Answering approvals from a phone over plain HTTP is refused by default.** Use HTTPS (for example a Tailscale tunnel) or opt
  in with `AETHER_REMOTE_APPROVALS_LAN=1`.
- The pages for orchestrating several agents are hidden until **Settings → Advanced features** is on; their addresses still open.
- A session's `basis` and `matched` fields are replaced by `confidence` and `evidence`. The layout accepts `local:` members and
  `terminal.start` takes an optional `resume`.

### Added

**Office life**

- Signals the office effects can rely on, derived on the server and bounded: a tool call in `hook.recent` carries `tags` (labels
  from a closed vocabulary of 23, such as `test`, `build`, `git.push.force`, `fs.rm.recursive`, `sudo`, `curl.pipe`; arguments,
  paths, branch names and patterns are never kept) and `ok` (`true` or `false` only when Claude Code's hooks, the transcript's
  `is_error` or a Codex exit code say so, else `null`). Claude subagents are read from their own transcript files, so they appear
  without hooks and gain `label`, `tokens` (total and per minute) and, once finished, a plain redacted `result` of at most 160
  characters. A session's `git.conflicts` counts unmerged files. The live stream gains the content-free kinds `squad` and
  `outcome`. See [provider compatibility](docs/provider-compatibility.md#signals-for-the-office-what-each-provider-gives-what-is-derived-what-is-missing).
- A session's subagents carry their lifecycle (`source`, `status`, `startedAt`, `endedAt`, `nickname`, `tools`), and a finished
  subagent stays for 90 seconds instead of vanishing. `hook.recent` gains `agentId`. Older control planes' answers still parse.
- The office layout can hold a squad zone: floor beside a supervisor's desk for its subagents (`schemaVersion` 2, written only
  when a layout has one; every existing layout stays valid and no desk moves). The layout editor adds, sizes and pins zones.
  Subagents are not seated in them yet.
- The session panel shows the supervisor and subagent relation in 2D: a squad group per supervisor with nested subagent rows
  (status dot, type, elapsed time, tool count, "waiting for approval", finished rows dimmed through the 90 s grace),
  collapsible with the choice remembered, keyboard navigable as a tree, with a count chip ("3 subagents · 2 working"). A
  supervisor's conversation gains a squad strip and a "Subagent activity" card per spawn; a subagent's own view links back with
  "Spawned by". Squad members share an accent and a subagent's portrait carries a tether glyph. A Claude session working without
  hooks says its subagents need the hook and offers the install command. Changes are announced in one throttled live region.

**Settings**

- Settings is rebuilt as eight groups (General, Notifications & approvals, Connections, Models & execution, Office, Advanced,
  Data & privacy, About) with a sticky navigation and scroll mark on a larger screen, and on a phone a list of groups that each
  open their own page with a Back button. `/settings/<group>` and `#<group>` open a group.
- Every row says what is true now: notification permission and how to re-enable it, whether answering over this connection is
  allowed, whether the page is a secure context, whether each CLI was read, whether local sessions are on (with the environment
  variable), the install state. Owner- or operator-only rows are locked with the reason. Terminal commands (doctor, hook status and
  install, the remote-approval hook) have copy buttons.
- Search (press `/`) narrows the rows by label and description in either language and marks the words.
- Theme gains **System**; a stored `dark` or `light` keeps its meaning. A change to Advanced or Remote approvals shows a notice
  with Undo. Export or reset the browser's preferences from Data & privacy.
- Switches are `role="switch"` (specs that looked for a checkbox now look for a switch).
  **KPIs**

- Token and Git KPIs on every office. A strip over the office (tokens today with a week's sparkline, sessions running, commits
  today, branches merged this week) opens a dashboard (a side panel, a bottom sheet on a phone) for the building and for each
  office: tokens by kind (input, output, cache read, cache write, reasoning), per day for 7 and 30 days, by model, by project,
  the heaviest sessions, Claude's and Codex's rate-limit windows as rings with the reset, and commits, merges, merged and open
  branches, authors, lines and the oldest open branch. Each deck of the floor switcher shows its tokens today with a bar and a
  rate, and the floor on show has a plaque (desktop). Counted from the local transcripts incrementally (appended bytes only,
  a numbers-only rollup in the data directory, history read in the background); no cost is shown because no price table exists
  on the machine. New routes `GET /api/usage` and `GET /api/usage/git` (owner and operator).

**Session panel and composer**

- Wrappers never show as code in the conversation: any XML-style tag outside code (`<task-notification>`, `<system-reminder>`,
  `<function_results>`, a stray `</div>`) is removed by a structural rule while `Array<string>` and placeholders stay text, and
  the wrappers that carry meaning become chips: a finished background task with its real exit code, a slash command, command
  output, "Context added" (one chip that opens into clean text), a hook, "Interrupted by user". Task ids and output paths are
  never shown.
- The conversation gains day lines, "New since you looked", relative times, copy as Markdown or plain text, code blocks with a
  wrap switch and line numbers, find (Ctrl or Cmd+F, highlights without touching the page), `j`/`k`/`g g`/`G` between turns,
  a compact density, and empty and error states with a retry.
- A text pipeline: HTML an agent or the CLI left in a message (`<span class="tx">`, `<br>`, tables, `&nbsp;`) is neutralized
  once on the server into Markdown or text, injected context, thinking and slash-command wrappers are resolved, and titles
  are cleaned and shortened on a meaning boundary with balanced brackets (the unbalanced `【…（…` of a cut title is fixed).
  One tested kernel module (`neutralizeHtml`, `cleanTitle`, `shortLabel`) serves the server, the page and the scene.
- Name tags are redesigned as small glass chips: provider mark, a glowing status dot, a short label (no id prefix; the id and
  full title are in the tooltip), a department-colour edge, state accents, density by distance and an opened card with the
  repository, role and context share on hover or selection.

- Installable app: a complete manifest (id, scope, display override, categories, maskable 192 and 512 icons, shortcuts to Sessions
  and Approvals), `theme-color` per scheme that follows the theme chosen in the app, an install button where the browser offers
  one and the Add to Home Screen steps on iOS (once; a dismissal is remembered). A service worker, only in a secure context
  (https, `localhost`, `127.0.0.1`), keeps the page and its hashed files so a page left open across a server rebuild still finds
  its chunks, asks "A new version is ready" before updating, never stores API answers, and has a `?sw=off` kill switch. Plain HTTP
  on the network gets none of it; docs/getting-started.md explains the HTTPS options and the Host/Origin rewrite a proxy needs.

- Markdown is shown as text and styling everywhere, never as raw syntax. One tested module in the kernel
  (`packages/kernel/src/markdown-*.ts`) parses a reply (headings, nested, numbered and task lists, tables, quotes, rules, fenced
  code, emphasis, links, images as alt text, HTML noise dropped) and makes the short plain previews the feed rows, the phone
  peek line, member bar, session titles and notifications show. The speech endpoint now cuts a reply on a safe boundary and closes
  any open fence, code span, emphasis or link. See docs/design-system.md, Conversation rendering.
- The speech bubbles over the characters are redesigned: glass with a neon edge in the member's department color, bold, code
  chips, bullets and small-label headings instead of raw text, a teleprompter that scrolls a long reply by itself (paused by
  hovering, off with reduced motion), word-by-word typing with a caret, and a spring-in.
- The conversation reveals a reply that arrives live word by word, enters new messages with a short rise, shows a shimmering
  "Working" line with the seconds elapsed, folds tall older messages behind "Show more", and renders tables, quotes, rules,
  task lists and links.

- The panel beside the 3D office is a live session workspace. With nothing chosen it is a feed of every observed session in four
  groups (needs you, working, recently finished, idle) with the newest reply, the running tool or what it waits for, and an unread
  dot kept per session in this browser. A chosen member opens its conversation: turns with the prompt, the reply as Markdown and
  each run of tool calls folded into one line, a "N new" pill when you have scrolled up, and one closed fold for the directory,
  process and the rest. On a phone it is a bottom sheet (peek, half, full).
- The panel can be resized between 320 and 720 px (at most 60% of the window) by dragging its edge or with the keyboard; a
  double-click resets it and folds it to a 48 px rail with needs-you and unread badges. The width is kept per browser and the
  office follows it live. Inside, the panel adapts to its own width.
- A composer for sessions that run inside an AETHER terminal: multi-line input, a pending bubble until the transcript shows the
  prompt, a queue of ten messages while offline or busy, Stop (Esc, Ctrl+C, then Stop process), `/` for the CLI's commands and
  skills, `@` for file paths and a model chip. A session started in another terminal stays read-only and offers **Continue in
  AETHER** and **Fork in AETHER**. New endpoints: `GET /api/local-sessions/:key/terminal`, `/commands` and `/files`.
- `GET /api/models` lists the models Codex and Claude Code offer on this machine, with effort levels, source and staleness,
  shown in Settings → Execution as "Detected models". Nothing is written under `~/.claude` or `~/.codex`.

**Live updates**

- `GET /api/local-sessions/stream`, a bounded server-sent change stream (owner and operator only) fed by one shared watcher. It
  names the session and the kind of change, never content, and replaces most polling; the queries poll only as a slow safety net
  while it is live. The top bar shows live, connecting, reconnecting or offline with the age of the last update, and reconnects
  back off exponentially.
- ETag and `304` for `/api/local-sessions`, `/speech` and a transcript: an idle panel moves about an eighth of the bytes it did.

**Approvals, alerts and phones**

- Remote approvals (opt-in, off by default): a Claude Code permission prompt can be answered from the panel and the phone. One
  synchronous `PermissionRequest` hook posts a redacted, bounded summary to the control plane, waits up to 45 s (configurable)
  and prints Claude's decision; with no answer, offline or on any error Claude asks in its terminal as usual. The card offers
  Allow once, Allow for this session (only a rule Claude itself offered) and Deny with a reason. Decisions are owner and operator
  only and audited.
- Clock out: sessions idle for a day or more (1, 3 or 7 days) are picked together or one by one and sent home in one action. The
  server re-checks each, ends the process (`SIGTERM`, then `SIGKILL`) and reports a result per session; the office shows the
  members packing up and leaving by the elevator.
- Notifications are on by default for a session that needs you, a waiting approval and a long turn that ended while the tab was
  hidden. They carry the project name only, a tap opens the session and a refused permission falls back to an in-page notice.
- "Open on your phone" in the top bar opens the pairing QR; the control plane prints the LAN addresses and a one-time QR at
  start when `AETHER_HOST` is set. Pairing is one-time and five minutes, a remembered device keeps its session for 30 days, and
  one code serves every network address of the computer.
- A web app manifest and icons: "Add to Home Screen" opens the office full screen on iOS and Android.
- Navigation for CLI users: the sidebar, the phone's tabs (Office, Sessions, Approvals, Terminals) and quick open show the CLI
  set; tasks, review, team, knowledge, messages, execution hosts, workspaces, schedules, A2A clients and integrations sit behind
  Settings → Advanced features. Two labelled chips on the office (Running, Needs you) carry their counts, and one unread count is
  shared by the top bar, the sidebar and the panel badge.

**The 3D office**

- Direct interaction with the characters: a second click, right click, press-and-hold or Enter opens an action menu (open the
  conversation, follow, look at the screen, pin to the wall, quick message and replies, interrupt, continue or fork, copy the
  resume command, stop, send home); what is not possible is listed disabled with the reason. Six emotes, a hover card, Alt +
  drag to carry a desk to another seat (validated like the layout editor, with an undo) and Shift + click or drag for a group.
  Everything works from the keyboard and is announced.
- The repository as a spire through the middle of the building: branches braided as glass strands with a bead per commit, and
  above the roof a flowering crown that history builds, one flower per twelve commits and a great bloom on top, in a bank of
  clouds. A hover card names a commit or a flower; the commit graph carries each author. A toggle is off by default on phones.
- Context window and compaction: a gauge beside each desk monitor (calm, amber from 60%, red above 85%), the share on name tags
  and in the panel, and a short effect with a "compacted -N%" chip when the CLI compacts. Small Claude and Codex marks appear on
  name tags, desk screens, feed rows and the conversation header. Sessions report `usage.contextPct` and `usage.compactedAt`.
- Members working hard type faster, their screens stream and, flat out, smoke and spark. Desk screens look like the work being
  done: an editor with tabs from the real recent files and code in the real file's language, a terminal under the real command,
  a browser at the real host, a test runner, a commit graph or diff, an agents chat, a notebook, a design canvas, a Markdown
  preview, a dashboard, a lock screen when idle and a prompt dialog while waiting for approval, chosen by the kind of tool call
  and the role. Real facts stay real (file names, command heads, tool, branch, counts, state); everything else is generated,
  seeded by the member and never claims an outcome. Desks differ: a dark or light theme, window chrome, a second monitor on
  some roles, and a mug, plant, figure, headphones, notepad or sticky notes. Characters act less like loops: a seeded director
  picks small actions by work mode, species and desk (thinking while the model writes, nodding while reading, a glance at the
  second monitor, a yawn after a long quiet, a shrug on an error), with cool-downs, human waits and a slow sway of the chair.
  Screens are painted at 5, 2 or 1 Hz by distance (once per change under reduced motion). `?intensity=N` previews a different
  desk and role per member.
- A control-room wall of up to four live views follows the other busy members on a wide screen, with a load meter, neon corners
  and scan lines; a pinned member always gets a view.
- Working members show their latest prompt and reply as two bubbles over their heads (up to six at once; only the selected or
  filmed member on a phone), served to owner and operator only, redacted and never stored (`GET /api/local-sessions/speech`).
- The office reacts to messages and relations: members in a current message turn toward each other and the receiver nods when
  an envelope lands, a hovered member is joined by a thin line to its repository's members, subagents are tethered to their
  parent, a member that wants a person has a pulsing ring, and dust and light shafts follow the hour.
- Every character has its own generated portrait of its animal, drawn from its id with varied features and accessories and a
  subtle state expression.
- Performance: the shadow map is redrawn at 20 Hz, distant characters animate less often, the pixel ratio adapts down to 0.75
  when frames run slow, and shaders compile behind a short loading cover. The `?perf=N` probe reports p99, CPU time per frame,
  programs and estimated GPU memory.
- A first-visit intro tour: a slow 360° orbit of the building, the exploded view, a rise up the spire to the flowering crown, then
  the start view. It plays once per browser session (once ever on a phone), any input stops it where the camera is, Esc lands on
  the start view, "Don't show again" and a Replay button are in the controls, and reduced motion shows three stills. The
  8-stop room tour is renamed "Guided tour (rooms)". `e2e/intro-perf.spec.ts` (`PERF_GPU=1`) measures its frames.
- `scripts/contact-sheet.mjs` renders the scene's views (and, later, each office-life effect at fixed times through
  `?preview=life&effect=<id>&t=<ms>`) into one labelled sheet per category for a visual review, and
  `e2e/office-life-perf.spec.ts` (`PERF_GPU=1`) measures a baseline against a variant scene on a real GPU, interleaved and
  repeated, into `evidence/office-life-perf.json`.

**Foundations**

- Control plane (Fastify, SQLite) with roles, idempotent commands, an event log, tasks, messages, rooms, reviews, approvals,
  schedules, knowledge review, skills, integrations, an A2A gateway, backups and a typed HTTP API.
- Independent runner: Git worktrees, Codex and Claude native execution, MCP tools, interactive terminals, read-only observation,
  verifiers and a durable journal.
- Read-only discovery of local Claude Code and Codex sessions with liveness (active, idle, dormant, orphaned, zombies), role
  classification, hooks and one-tap stop and zombie-reap actions; terminal agent-state detection (working, waiting, idle).
- A 3D office with eight animal characters, a ghost and a jiangshi, a camera director, communication links and a screen on each
  desk showing what the session is really doing.
- A responsive React workbench for desktop, tablet and phone, including a full-screen 3D phone layout, with a token-based design
  system and a lint that enforces it.
- A Blender pipeline for the animals with a desk-and-chair clipping audit, a loop-seam check and a review renderer.
- Claude subscription limits in the top bar, read from an existing local file.
- A verification ledger and a generated report.

**Release tooling**

- `scripts/oss`: a publishing-readiness check (`pnpm run oss:check`; personal paths, private strings, secrets, large and
  path-embedding binaries, community files, licenses, documentation links, `.gitignore`, commit hygiene; `--history` scans every
  commit) and a reproducible history cleanup that never touches this repository: `history-plan.mjs` (strategies A, B and C, with
  milestone proposals), `history-apply.sh` (a throwaway clone and `git filter-repo`), `history-verify.sh` (tree, authorship,
  size, gitleaks, install, typecheck, tests, go or no-go). See [docs/release](docs/release/history-cleanup.md).
- `.mailmap`, `.gitattributes`, a gitleaks configuration, a commit-message convention (`type: subject`, at most 72 characters)
  with an optional `commit-msg` hook and a CI job that checks pull request titles and commit subjects, and a publishing checklist.

### Changed

- Roles and departments are decided by one pure, deterministic classifier (`packages/kernel/src/classify-session.ts`) that scores
  18 roles from weighted signals (what the session did, title, prompt, branch, repository, subagent types, in English and
  Traditional Chinese) instead of the first keyword in the title. It never asks a model or the network. Each session carries a
  `confidence` and up to five redacted `evidence` strings, weak evidence leaves a neutral generalist, and a role changes only
  after three separate looks, so characters no longer flip floors; saved desks are never moved. Accuracy: 84.9% to 100% on a
  93-case labelled synthetic corpus, 48% to 90% on 50 hand-labelled real sessions. See [docs/roles.md](docs/roles.md).
- The automatic camera is calmer: each shot is one slow, short dolly (no orbit, no zoom, level horizon), shots are held longer,
  near shots glide and distant ones cut, a member or pair is not shown again for 30 seconds, and a touch ends a flight at once.
- "Create task" and "Edit layout" on the office page are behind Settings → Advanced features, like the pages they open. The
  notification switch moved from the Approvals page to Settings and covers sessions as well as approvals; the pairing panel moved
  from Settings to the top bar.
- The transcript endpoint returns each tool call's id and a short redacted target, and the last 120 entries.
- Seated arms rest naturally on the desk, gestures no longer start with the arm doubled up, tails are smooth tubes with five bones
  and no longer pass through the chair, a sleeping member folds over the desk, and an idle member's branch beam is thin and cool.
- Phone performance: the first-load script no longer includes zod (218 to 187 KB gzip), and the 3D scene stops drawing while the
  full-height sheet covers it (main-thread time with the conversation open down by about 85%).

### Fixed

- The floor plaque no longer covers the middle of the scene (it sits above the floor readout), the KPI strip no longer squeezes the scene below the control-room wall's minimum height on a roomy window, and sessions with the same modification time keep their order (and their desks) from one scan to the next.
- A runner started before it is enrolled prints how to enroll instead of a stack trace; the terminals and approvals pages say how to get profiles and prompts into them; the errors a CLI user can hit (wrong token, live agents off, no runner) are worded in both languages instead of raw codes; a finished session no longer claims it has no reply; the office no longer logs a removed-shadow-map warning on every load.
- A page left open across a rebuild no longer goes blank: a chunk that cannot load reloads the page once, and any other render
  error shows a Reload button instead of an empty screen.
- Close-up camera shots now push in (the orbit controls' nearest distance had held the camera still), and members sent home walk
  with planted feet.
- A name tag that would sit under a speech bubble is hidden instead of drawn over what the member said.
- The control-room wall no longer disappears at 1440x900 when an observed session is listed, and its views no longer go black
  when the wall's members change.
- Pointing at the spire's crown works again (the top bead of every strand had a size of NaN), and the crown's glass is dimmer so
  stacked decks no longer burn to white.
- Members beyond a floor's 48 desks no longer vanish: they take a desk on the next floor with room, and the scene, the camera
  and "show in office" follow the member's actual desk.
- "Show in office" links and feed rows of another project now bring the camera to the member on a phone too.
- The office chairs no longer flicker (the seat and the cushion shared a plane).

### Security

- Host and Origin allow-list for local-network access, CSRF protection, scoped per-run MCP credentials, secret redaction,
  SSRF-guarded outbound fetches and no permission bypass.
- Remote approvals are hardened (see [docs/security.md](docs/security.md)):
  - The server signs every decision (HMAC-SHA256 of the request id, the hook's nonce and the answer) and the hook prints one only
    when the proof verifies, so a process squatting the loopback port cannot answer for a person. The hook never follows redirects.
  - Listing and deciding requests need the browser session (cookie, plus CSRF to decide); a bearer token such as the owner token
    on disk is refused. Over plain HTTP on a network the decision is refused unless `AETHER_REMOTE_APPROVALS_LAN=1`.
  - The hook is a private copy in `~/.aether/hooks/` (0700 directory, 0500 files) and `pnpm hooks status` reports a modified copy.
    `~/.aether` is chmod 0700, `approvals.json` is written atomically, and symlinks are refused.
  - A correct hook token is never locked out and wrong ones are; the hook routes accept loopback callers only; the failed-attempt
    map is pruned and capped; the create rate limit runs before the project scan.
  - Summaries show every `MultiEdit` edit and `replace_all`, strip bidirectional, zero-width and C1 control characters before
    redacting, and put the command before the agent's description. The compact card offers Review instead of Allow for a multi-line,
    cut-short or changing call, and a session-rule label is shown whole or not offered.
  - Redaction also covers JSON-style (`"password": "..."`) and environment-style (`AWS_SECRET_ACCESS_KEY=`, `PGPASSWORD=`) secrets
    and structured tool input by key name.

### Removed

- The upstream agent-office application; its attribution is kept in THIRD_PARTY_NOTICES.md.
