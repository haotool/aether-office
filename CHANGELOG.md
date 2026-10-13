# Changelog

[Documentation](docs/README.md) · [Project](README.md)

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project follows its [pre-release version policy](docs/release/versioning.md).

## [Unreleased]

## [0.4.1] - 2026-10-14

### Changed

- Reorganize the English and Traditional Chinese READMEs, documentation navigation, contributor guidance and release checklist.
- Check documentation formatting and selected Linux browser workflows in CI; run source checks on both Linux and macOS.
- Pin Linux CI to Ubuntu 24.04 and run the SHA-pinned checkout action on its supported Node 24 runtime.

### Fixed

- Replies with unequal, very long backtick delimiters no longer trigger repeated quadratic scans in HTML neutralization; adjacent code spans retain their protection.
- Browser-test retries release their synthetic terminal slots and restore deleted observer fixtures, so later tests remain independent.
- A cell of an HTML table in a reply that held a backslash before a pipe (`a\|b`) could split into an extra column once the table
  was turned into Markdown; the backslash is now escaped along with the pipe.
- Neutralizing raw HTML in a very long reply no longer backtracks quadratically on thousands of `<code` openers inside `<pre>` or
  on a long run of spaces in a code block (two regular expressions).
- Importing a skill whose frontmatter line held tens of thousands of spaces and a stray carriage return stalled the control
  server for seconds; the line is now read in linear time.
- A reply with a line of tens of thousands of backticks stalled the conversation text pass for seconds; code spans are now
  found in linear time, and a run of more than 16 backticks no longer delimits a span.
- Checking whether a session's process had been orphaned stalled for seconds when its parent's command line was very long; the
  check is now linear, and `--user` has to follow `systemd` within 256 characters.

### Security

- Bind every manual release-evidence entry to a full ancestor commit SHA instead of accepting unversioned review claims.
- Validate version, changelog, workspace manifests, clean state and annotated tag identity before a release tag is pushed.

## [0.4.0] - 2026-10-13

The first public release. AETHER OFFICE started from [agent-office](https://github.com/AgentSystemLabs/agent-office) (MIT; see
`THIRD_PARTY_NOTICES.md`) and is now a local-first office for the Claude Code and Codex sessions on your machine: a live session
panel, remote approvals, KPIs, squads and a 3D office driven by real signals. It is a pre-release: the
[verification ledger](docs/verification/report.md) says which capabilities are verified and which are not.

### Upgrade notes

For anyone who ran a development build before this release.

- **Restart the control plane after upgrading.** The running server keeps the code it started with and answers an updated page
  in the older shape until it is restarted.
- **Re-enable Remote approvals and reinstall the hook** (Settings → Notifications & approvals, off and on, then
  `pnpm hooks install --remote-approvals`). The configuration file now also holds a `verifyKey`; with an older file the hook
  falls back to Claude's terminal prompt.
- **Run `pnpm hooks install` again** in each project or scope you installed it in, so Claude Code also reports failed tool calls
  (`PostToolUseFailure`; `pnpm hooks status` lists it as missing until then). Until you do, a failed call is "not known" unless
  the transcript says so.
- **Answering approvals from a phone over plain HTTP is refused by default.** Use HTTPS (for example a Tailscale tunnel) or opt in
  with `AETHER_REMOTE_APPROVALS_LAN=1`.
- The pages for orchestrating several agents are hidden until **Settings → Advanced features** is on; their addresses still open.
- A session's `basis` and `matched` fields are replaced by `confidence` and `evidence`. The office layout accepts `local:` members
  and squad zones (`schemaVersion` 2, written only when a layout has a zone; existing layouts stay valid and no desk moves), and
  `terminal.start` takes an optional `resume`.
- Stored preferences are versioned and migrated; the theme may now be `system`.
- `AETHER_HOME` relocates `~/.aether` (hook scripts, approvals file, hook spool). `pnpm hooks install|remove` prints the files it
  writes before writing and supports `--dry-run`.

### Added

**Watch: the session panel and live updates**

- A panel beside the 3D office (a bottom sheet on a phone): a feed of every observed session in four groups (needs you, working,
  recently finished, idle) with the newest reply, the running tool or what it waits for, and an unread dot kept per session in
  this browser; choosing a session opens its conversation. Resizable between 320 and 720 px, foldable to a rail with needs-you and
  unread badges.
- `GET /api/local-sessions/stream`, a bounded server-sent change stream fed by one shared watcher (names the session and the
  kind of change, never content), replacing most polling; the top bar shows live, connecting, reconnecting or offline. ETag and
  `304` for the heavy reads: an idle panel moves about an eighth of the bytes it did.
- Context-window gauge and compaction effect at each desk; Claude and Codex marks on name tags, desk screens and feed rows.
- A control-room wall of up to four live views that follow the other busy members, a calmer automatic camera, and name tags
  redesigned as small glass chips.
- Desk screens that look like the work being done (editor, terminal, browser, test runner, commit graph, ...) from the real
  recent files, command heads and hosts; real facts stay real and nothing claims an outcome.
- Speech bubbles over working members with the latest prompt and reply, rendered as Markdown (redacted, never stored, owner and
  operator only).
- Read-only discovery of local sessions with liveness (active, idle, dormant, orphaned, zombies), terminal agent-state detection,
  and role classification by one deterministic classifier (see Changed).

**Talk: conversation and composer**

- The conversation: turns with the prompt, the reply as Markdown (headings, lists, tables, quotes, code, links, task lists),
  tool runs folded into one line, day lines, "New since you looked", copy as Markdown or text, find (Ctrl or Cmd+F), `j`/`k`/`g g`/`G`
  between turns, a compact density, and live replies revealed word by word.
- Notices instead of tags: wrappers (`<task-notification>`, `<system-reminder>`, ...) never show as code; the ones with meaning
  become chips (a finished background task with its real exit code, a slash command, command output, "Context added", a hook,
  "Interrupted by user"). A text pipeline neutralizes HTML an agent left in a message, resolves injected context and cleans and
  shortens titles on a meaning boundary (`neutralizeHtml`, `cleanTitle`, `shortLabel`).
- A composer for sessions that run in an AETHER terminal: multi-line input, a pending bubble, a queue of ten, Stop, `/` commands
  and skills, `@` file paths and a model chip. Any other session stays read-only and offers **Continue in AETHER** and **Fork in
  AETHER**. New endpoints `GET /api/local-sessions/:key/terminal`, `/commands`, `/files`.

**Approve**

- Remote approvals (opt-in, off by default): a Claude Code permission prompt can be answered from the panel and from a phone
  (Allow once, Allow for this session using only a rule Claude offered, Deny with a reason). One synchronous `PermissionRequest`
  hook posts a redacted, bounded summary, waits up to 45 s (configurable) and prints the decision; with no answer, offline or on
  any error Claude asks in its terminal as usual. Owner and operator only, audited. The Approvals page lists the pending requests.
- Notifications (on by default) for a session that needs you, a waiting approval and a long turn that ended while the tab was hidden.
  They carry the project name only; a tap opens the session.

**Understand**

- KPI dashboards: a strip over the office (tokens today with a week's sparkline, sessions running, commits today, branches merged)
  opens a dashboard for the building and each office: tokens by kind, per day for 7 and 30 days, by model and project, the heaviest
  sessions, Claude and Codex rate-limit windows as rings, and commits, merges, merged and open branches. Counted incrementally
  from local transcripts; no cost is shown because no price table exists. Routes `GET /api/usage` and `/api/usage/git`.
- `GET /api/models` and **Settings → Detected models**: the models each CLI offers, with effort levels and staleness, read from
  the CLIs' own caches (never written).
- The Git beanstalk: branches rise through the building as braided glass strands, one bead per commit, with a flowering crown that
  history builds above the roof (one flower per twelve commits, a great bloom on top) and a hover card per commit.
- Session signals the office can rely on: command labels from a closed vocabulary of 23 (arguments and paths are never kept),
  tool outcomes (`ok`) only when Claude's hooks, the transcript or a Codex exit code say so, `git.conflicts`, and Claude subagents
  read from their own transcript files (label, tokens, a plain redacted result).

**Tidy up**

- Clock out: sessions idle for a day or more (1, 3 or 7 days) are picked together and sent home in one action; the server
  re-checks each, ends the process (`SIGTERM`, then `SIGKILL`) and reports a result per session. Transcripts are never deleted.

**Squads and subagents**

- A supervisor's subagents sit together in a squad zone beside its desk, walk in from the elevator core and back, with a beam of
  light into the core whose brightness follows tokens per minute (or tool calls). Puppet strings tighten on every tool call; a
  finished subagent hands its result to the supervisor's desk and a stamp reads RECEIVED (a receipt, never an approval) or a grey
  RETURNED when the result is flagged as an error.
- In the panel a supervisor and its subagents read as one tree group with a count chip, nested rows, a squad strip and a
  "Subagent activity" card per spawn, a "Spawned by" link, and a note when Claude subagents need the hook.

**Have fun: office life**

- Little decorative moments, each from a real signal and never claiming a result unless the provider stated one: a rubber duck, a
  test lamp and bug (green or red from the real exit status), packages installing, a rocket for a successful `git push`, a pager
  bell, steam, a loop ring, copy-and-paste keycaps, a `:q!` sign, a stand-up circle, danger stripes for a force push, a tug-of-war
  for merge conflicts, a deploy launch pad, an LGTM stamp for a real approval, confetti for the Konami code, and more. One draw call
  for all of them, with cooldowns and a seeded chance. **Settings → Office** has Calm mode (on when the system asks for reduced
  motion), a switch per kind and the frequency.
- A first-visit intro tour (orbit, exploded view, a rise up the spire to the crown), once per browser session, with Replay.
- Direct interaction with characters: an action menu (open, follow, look at the screen, pin to the wall, quick message, interrupt,
  continue or fork, copy the resume command, stop, send home), where an action that cannot be done says why; six emotes; Alt +
  drag to carry a desk (validated like the layout editor, with undo); Shift for a group. Generated portraits for every character.
- A lost WebGL context shows a card with "Reload the scene" and "Use the list" instead of silently switching to the list.

**Phone, PWA and settings**

- "Open on your phone" with a one-time QR code (also printed at start when `AETHER_HOST` is set, and by `pnpm run pair`); a paired
  phone is remembered for 30 days. A full-screen 3D phone layout.
- An installable app: manifest, icons, shortcuts to Sessions and Approvals, install button and iOS steps, and a service worker
  (secure contexts only, never caches API answers, asks before updating, `?sw=off` to remove it).
- Settings rebuilt as eight groups (General, Notifications & approvals, Connections, Models & execution, Office, Advanced, Data &
  privacy, About) with search (`/`), real state in every row (permission, secure context, which CLI was read), a **System** theme,
  and Undo for risky switches. About states the licence and that the project is not affiliated with Anthropic or OpenAI.
- Navigation for CLI users: office, sessions, approvals, terminals, history and settings; everything else behind **Advanced features**.

**Accessibility and language**

- A skip link, a labelled navigation, and an accessible name plus a live text summary for the 3D canvas. A disabled control names
  its reason to assistive technology as well as in a tooltip. Switches are `role="switch"`; the bottom sheet is modal (the page
  behind it is inert, Tab stays inside, focus returns to what opened it).
- `forced-colors`, `prefers-contrast: more` and `prefers-reduced-transparency` are supported; controls on a touch screen have a
  44 px hit area, and the name tags floating in the 3D scene are at least 24 px wide.
- The first-visit language follows the browser (`zh*` is Traditional Chinese, otherwise English) and a saved choice is never
  overridden. Common errors and the 3D scene's own words are in both languages.

**Execution, interoperability and foundations**

- Control plane (Fastify, SQLite) with roles, idempotent commands, an event log, tasks, messages, rooms, reviews, approvals,
  schedules, knowledge review, skills, integrations, an A2A gateway, backups and a typed HTTP API.
- An independent runner: Git worktrees, Codex and Claude native execution, MCP tools, interactive terminals, read-only observation,
  verifiers and a durable journal. Hooks for Claude Code and Codex.
- Eight animal characters, a ghost and a jiangshi, generated by a Blender pipeline with a desk-and-chair clipping audit.
- A responsive React workbench for desktop, tablet and phone with a token-based design system and a lint that enforces it.
- A verification ledger and generated report; `pnpm run doctor`; Claude subscription limits in the top bar.
- A computed quality scorecard (`pnpm run quality`, ten areas, checked in CI) and licence compliance: `THIRD_PARTY_NOTICES.md`
  generated from the lockfile, a CycloneDX SBOM (`node scripts/oss/third-party-notices.mjs --sbom <file>`), `REUSE.toml` and
  `docs/legal`.
- Release tooling in `scripts/oss`: a publishing-readiness check (`pnpm run oss:check`) and a reproducible history cleanup that
  never touches the working repository; a commit-message convention checked in CI; `scripts/docs-screenshots.mjs` for the README
  images; `scripts/contact-sheet.mjs` and GPU perf specs for visual review.

### Changed

- Roles and departments are decided by one deterministic classifier (`packages/kernel/src/classify-session.ts`) that scores 18
  roles from weighted signals in English and Traditional Chinese instead of the first keyword in a title. It never asks a model or
  the network, reports a `confidence` and up to five redacted `evidence` strings, falls back to a generalist on weak evidence and
  changes a role only after three separate looks, so characters do not flip floors. Accuracy: 84.9% to 100% on a 93-case synthetic
  corpus, 48% to 90% on 50 hand-labelled real sessions ([docs/roles.md](docs/roles.md)).
- A subagent no longer takes a desk across the room: it sits in its supervisor's squad zone (a floor with no room for a zone keeps
  desks, as before). A character keeps its desk while it stays in the office: desks are assigned once and remembered per project
  in the browser, and a saved layout is still never rearranged.
- The automatic camera is calmer: each shot is one slow, short dolly (no orbit, no zoom, level horizon), shots are held longer,
  near shots glide and distant ones cut, a member or pair is not shown again for 30 seconds, and a touch ends a flight at once.
- Phone performance, estimated and not yet measured on a real phone: no `backdrop-filter` blur anywhere (the glass over the scene is
  a near-opaque tint), the name tag's shimmer and glow no longer repaint, the 3D scene stops drawing while the full-height sheet
  covers it, and a quiet office page makes about 22 `/api` requests a minute instead of 55 (the approvals count follows the
  event stream; permission prompts are asked for every 2.5 s only while Remote approvals is on).
- The first load is about 203 KB (brotli, as `pnpm run quality:report` measures it), down from 251 KB: only the language in use is
  downloaded, the zod runtime no longer reaches the entry, and the conversation panel, the new-task form, the clock-out dialog,
  the pairing panel, the character menu and the sign-in page load when first used. The budget is 200 KB.
- "Create task" and "Edit layout" on the office page are behind Settings → Advanced features, like the pages they open. The
  notification switch moved from the Approvals page to Settings and covers sessions as well as approvals; the pairing panel moved
  from Settings to the top bar.
- A design system with one control scale (32, 36 and 40 px with a mouse, 36, 40 and 44 px on touch), one focus ring and shared `u-` classes;
  `@media` uses only the documented breakpoints and narrow components use container queries.
- The control database is pruned hourly: events and command receipts after 90 days, runner report ids and webhook delivery ids
  after 30 days, expired browser sessions (see Data retention in [docs/security.md](docs/security.md)).
- One definition of when a session counts as working (two minutes) and when one with no process is gone (ten), shared by the
  server and the web app. The product version is written once, in the root `package.json`.
- The provider marks are small decorative indicators, never branding (Codex's mark is tinted to the muted text colour);
  [docs/legal/trademarks.md](docs/legal/trademarks.md) says so.
- The transcript endpoint returns each tool call's id and a short redacted target, and the last 120 entries.
- A 3D floor now builds about a third faster. Furniture of the same size shares one extruded shape per build, and merging no longer constructs a throwaway default shape for every piece. In a lab run (Chrome, CPU slowed 4×, load not controlled) the longest task of the first load fell from about 323 to 269 ms and the total blocking time from about 304 to 262 ms. That is not a measurement on a real phone.
- README and `docs/native-execution.md` state that AETHER neither stores nor forwards your Claude credentials.
- The quality scorecard caps code lines at a recorded budget that only goes down; comments were cut to the few that explain why.
- README states that macOS is the tested platform and that the browser tests on Linux are not verified yet. CI does not run the browser suite (it needs a GPU), so `pnpm exec playwright test` is a local and release check.
- With `CI=1` the browser suite runs in Playwright's Chromium in its new headless mode; the headless shell it used before reports notification permission as denied, which failed one spec.

### Fixed

- A browser that came back after its tab was closed (or after iOS discarded it) looked signed in but had every write refused with
  `CSRF_REQUIRED`. The page now asks `POST /api/session/csrf` for a new token and retries once.
- A page left open across a rebuild no longer goes blank: a chunk that cannot load reloads the page once, and any other render
  error shows a Reload button.
- Usage readings say what they cover. The KPI dashboard shows "Not placed in an office" (what the office tabs leave out) and an
  unknown office is empty, never the building's numbers. The scan reports `truncated` with the real file count (the cap is 8192
  files), unreadable files and skipped lines. "Active time" is now "Session time". Rate-limit rings show the age of their reading
  and mark a stale one. Git KPIs flag a capped commit list and count authors by email.
- Claude usage: the parser no longer drops a line whose keys are reordered or whose usage is spaced; a message that appears in
  two transcripts (a resumed session) is counted once; a Codex subagent's rollout counts as part of its parent session; a session
  whose last turn is an API error no longer shows 0% context. The KPI numbers follow a session that starts or grows.
- A hook spool rotation no longer makes every session's hook state, waiting-for-approval badge and subagent squad disappear.
- A project folder that does not exist or cannot be read is a 400 `PROJECT_ROOT_NOT_FOUND` / `PROJECT_ROOT_INVALID`, not a 500. A
  migration checksum mismatch says which migration and what to do.
- `pnpm run doctor`: a missing Claude Code or Codex CLI is a warning (exit 0); a Codex version missing from `compat.json` reads
  "not verified, probably works"; `--strict` makes warnings fail. `pnpm run pair` tells an unreachable control plane from a
  rejected owner token. A runner started before it is enrolled prints how to enroll instead of a stack trace.
- A reply ending in a lone backslash that also held HTML made the chat show an error instead of the message.
- First run: with no project, or no character and no session, the office page shows what AETHER does, three steps and the commands
  to copy. A project id in the address that is not available falls back to the first project with a short notice; unknown pages
  show "Page not found". The tab title is `<page> · AETHER OFFICE` in the interface language.
- Create task, Propose knowledge and the login mark required fields and show their own inline errors.
- On a phone: the 2D office list scrolls below the view switch and the KPI chips, so no card passes under them, and ends above the new-task button; the floor rail
  scrolls instead of climbing over the top row on a short screen; a table row drawn as a card keeps every part of a value beside its
  label; the connection says "reconnecting" or "offline" in words; the top bar keeps language and theme on screen from 320 to
  1920 px.
- The Sessions page says when there is no session yet, or when the filters hide every one, and a button shows them all.
- Members beyond a floor's 48 desks take a desk on the next floor with room instead of vanishing; "Show in office" brings the
  camera to the member on a phone too.
- Scene fixes: close-up camera shots push in, members sent home walk with planted feet, pointing at the crown works, the
  control-room wall no longer disappears at 1440x900 or goes black when its members change, a name tag no longer draws over a
  speech bubble, and office chairs no longer flicker. An idle phone's pixel ratio no longer drops from 1.5 to 0.75 within seconds.
- The layout editor is labelled experimental and docks at the side of the screen.
- The 3D office no longer rebuilds every floor's geometry each time the session list refreshes (about every two seconds while sessions are live). A floor is rebuilt only when its furniture changes, not when someone sits down or leaves. In a lab run (Chrome, CPU slowed 4×, seven live sessions, load not controlled) the main thread had about 30 tasks over 50 ms per minute before and none after. That is not a measurement on a real phone.

### Security

- Host and Origin allow-list for local-network access, CSRF protection, scoped per-run MCP credentials, secret redaction,
  SSRF-guarded outbound fetches and no permission bypass.
- Remote approvals are hardened ([docs/security.md](docs/security.md)): the server signs every decision (HMAC-SHA256 over the
  request id, the hook's nonce and the answer) and the hook prints one only when the proof verifies, so a process squatting the
  loopback port cannot answer for a person; listing and deciding need the browser session (cookie plus CSRF), never a bearer
  token such as the owner token on disk; over plain HTTP on a network a decision is refused unless
  `AETHER_REMOTE_APPROVALS_LAN=1`; the hook is a private copy in `~/.aether/hooks/` and `pnpm hooks status` reports a modified
  copy; the hook routes accept loopback callers only and are rate limited; summaries strip bidirectional, zero-width and control
  characters before redacting, show every `MultiEdit` edit and `replace_all`, and the compact card offers Review instead of Allow
  for a multi-line, cut-short or changing call.
- Redaction also covers JSON-style (`"password": "..."`) and environment-style (`AWS_SECRET_ACCESS_KEY=`, `PGPASSWORD=`) secrets
  and structured tool input by key name.
- Pairing codes are 128-bit, single-use, valid for five minutes, carried in the URL fragment and stored only as a hash.
- Text from agents is never rendered as HTML: the server neutralizes it, the page builds elements from parsed data, and a test
  fails when a component prints a session-text field that is not classified.
- Behind a reverse proxy on the same machine the hook routes refuse a forwarded request, and `AETHER_TRUST_PROXY` (proxy
  addresses; default none) makes the sign-in limits count the real client and the session cookie `Secure` behind TLS. `GET /health`
  and the public GitHub webhook are limited to 120 calls a minute per address; the `.pre-migration` database copies are mode 0600
  and only the newest three are kept. The CI actions are pinned to commit SHAs.

### Removed

- The upstream agent-office application; its attribution is kept in `THIRD_PARTY_NOTICES.md`.

[Unreleased]: https://github.com/haotool/aether-office/compare/v0.4.1...HEAD
[0.4.1]: https://github.com/haotool/aether-office/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/haotool/aether-office/releases/tag/v0.4.0
