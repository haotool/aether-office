# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it has a stable release.

## [Unreleased]

Pre-release development (`0.4.0-dev`).

### Security

- Remote approvals review fixes (see docs/security.md). **Re-enable Remote approvals and reinstall the hook after updating**: the
  config file now also holds a `verifyKey`, and an older file makes the hook fall back to the terminal prompt.
  - The server signs every decision (HMAC-SHA256 of request id, the hook's nonce and the answer); the hook prints a decision only
    when the proof verifies, so a process squatting the loopback port cannot answer for a person. The hook also never follows redirects.
  - Deciding and listing requests need the browser session (cookie, plus CSRF to decide); a bearer token, such as the owner token
    on disk, is refused. The decision is refused over plain HTTP on a network unless `AETHER_REMOTE_APPROVALS_LAN=1`: by default a
    phone on the same Wi-Fi can see requests but cannot answer them (use HTTPS, or opt in). Settings and the card say so.
  - The hook is installed as a private copy in `~/.aether/hooks/` (0700 directory, 0500 files); `pnpm hooks status` reports a
    modified copy. `~/.aether` is chmod 0700, `approvals.json` is written atomically under a random temp name, and symlinks are
    refused. A symlinked `settings.json` is written through the link.
  - The compact approval card offers Review instead of Allow when the call is multi-line, cut short or a change. Summaries show
    every `MultiEdit` edit and `replace_all`, strip bidirectional, zero-width and C1 control characters before redacting, and put the
    command before the agent's description.
  - Redaction also covers JSON-style (`"password": "..."`) and environment-style (`AWS_SECRET_ACCESS_KEY=`, `PGPASSWORD=`,
    `MY_TOKEN=`) secrets, and structured input by key name.
  - A correct hook token is never locked out; wrong ones are. The hook routes accept loopback callers only, the failed-attempt
    map is pruned and capped, the create rate limit runs before the project scan, and a session rule label is shown whole or not
    offered.

### Added

- Remote approvals (opt-in, off by default): a Claude Code permission prompt can be answered from the panel and the phone.
  `pnpm hooks install --remote-approvals` adds one synchronous `PermissionRequest` hook (`packages/providers/src/hook-approval.mjs`),
  and Settings -> Remote approvals (owner) issues its token. The hook posts a redacted, bounded summary of the tool call to the
  control plane, waits up to 45 s (configurable, always below the hook's own timeout) and prints Claude's decision JSON; with no
  answer, offline or any error it prints nothing and Claude asks in its terminal as usual. The panel shows an approval card
  (Allow once, Allow for this session when Claude offered rules, Deny with a reason, a countdown) in the feed's "Needs you" rows,
  at the top of the conversation and over the phone's peek sheet, and the needs-you badge and alert count it. Only a button
  press decides; decisions are owner/operator only and audited (`permission-request.decided`). See docs/security.md.
- Live session updates. `GET /api/local-sessions/stream` is a bounded server-sent event channel (owner and operator only, 16
  streams, a heartbeat every 20 s, `Last-Event-ID` resume, a closed stream on logout, revocation or a role change) fed by one
  shared watcher that diffs the session scan; it names the session and the kind of change, never content. The panel's
  session list, speech and transcript refetch the moment something changes instead of every 2-10 s, and poll only as a
  slow safety net while it is live (and at their old intervals when it is not).
- A connection indicator in the top bar (live, connecting, reconnecting, offline, with the age of the last update).
  Reconnects back off exponentially with jitter, pause while the tab is hidden and refetch at once on waking, returning to the
  tab or getting the network back.
- ETag and `304` for `/api/local-sessions`, `/speech` and a transcript: an idle panel moves about an eighth of the
  bytes it did (measured: 19.8 KB to 2.4 KB a minute with 10 sessions), a busy one about 40% fewer.
- A web app manifest and icons (192, 512 and maskable): "Add to Home Screen" opens the office full screen on iOS and Android.

- A composer in the session panel for sessions AETHER can drive. When a session's process runs inside an AETHER terminal the
  panel's foot is a multi-line input (Enter sends on a desktop, a Send button and quick replies on a phone) that types into
  that terminal with the safe sequence (clear the line, the text as a paste when it has several lines, Enter a moment later,
  one write at a time per terminal), shows the message at once as a pending bubble that the transcript's own prompt replaces,
  queues up to ten messages while offline, busy or while someone else holds the lease, and replaces Send with Stop (Esc, then
  Ctrl+C, then "Stop process") while the session works. `/` opens a fuzzy menu of the CLI's commands, custom commands and
  skills (names and descriptions only; those that open a list in the terminal are labelled), `@` completes file paths of the
  session's directory, and a model chip sends `/model` (Claude) or opens Codex's own picker. A session started in another
  terminal stays read-only, now with **Continue in AETHER** and **Fork in AETHER**, which start a new AETHER terminal running
  `claude --resume` / `codex resume` (or the fork) in the same folder. New endpoints: `GET /api/local-sessions/:key/terminal`,
  `/commands` and `/files`; `terminal.start` takes an optional `resume`.
- A model catalog that follows the CLIs: `GET /api/models` lists the models Codex (`models_cache.json`, or `codex debug models`
  when the cache is over a day old) and Claude Code (its model-catalog cache plus the always-present `fable`, `opus`, `sonnet`
  and `haiku` aliases) offer on this machine, with the effort levels each supports, where the list came from and whether it is
  stale. Settings → Execution shows it as "Detected models", and a presentational `ModelPicker` (model chips by provider, an
  effort selector limited to the model, a refresh button) is ready for the session composer. Read-only: nothing is written
  under `~/.claude` or `~/.codex`.
- Information architecture for CLI users. The sidebar, phone tab bar and quick open show the office, local sessions, approvals,
  terminals, history and settings; the pages for orchestrating several agents (tasks, review, team, knowledge, messages,
  execution hosts, external observation, workspaces, and Settings' schedules, A2A and integrations) are behind **Settings →
  Advanced features** (off by default; their addresses still open). The phone's tabs become Office, Sessions, Approvals,
  Terminals.
- The two office chips are labelled (Running, Needs you), carry their count in an accessible name, and the orange one now
  counts sessions waiting for an approval or an answer before the forgotten and ownerless ones.
- Notifications are on by default: a session needs you, an approval waits, a long turn ended while the tab is hidden. They show
  the project name only, a tap opens the session, the browser's permission is requested on the first click, and a refusal falls
  back to an in-page notice. The tab title and the sidebar and tab badges count what needs you.
- "Open on your phone" in the top bar (and the phone drawer) opens the pairing QR, with the plain-HTTP caveat; the control plane
  prints the LAN addresses and a one-time QR at start when `AETHER_HOST` is set, and one line on how to enable it otherwise.
- A flowering crown on the beanstalk: every tier of the history (one per 12 commits, up to 12) is a flower grown from its first
  commit's hash (eight blended archetypes, none a closed bud; Fibonacci petal counts, Vogel-spiral florets, glowing stamens,
  glass petals with vein glow and an iridescent edge, optional rings and orbiting pollen) on a stem that leaves the braid and
  arcs out and up, in a spectrum of hues, so the crown reads as a flowering tree and not as stacked floors. Tiers with merges
  grow glass trees by space colonization ending in buds, each of the newest 16 merge commits blooms a small flower on the
  braid (its hover card shows the merge's subject), and the top ends in a great bloom over the clouds: five whorls of curved
  glass petals, a pistil, a crown of beaded stamens, three holographic rings and orbiting motes, 11 to 22 m across. Flowers open
  from buds in turn (nothing moves with reduced motion); a tap shows the hover card on a touch screen. Two draw calls, about
  24,000 triangles for a full crown.
- Clock out: sessions idle for a day or more (1, 3 or 7 days) can be picked all at once or one by one and sent home in one
  action. The server re-checks each (still idle, same process, owner's project), ends the process (SIGTERM, then SIGKILL)
  and reports a result per session; the 3D office shows them standing up, waving, taking a bag and walking out to the
  elevator.
- The repository in the 3D office as a spire through the middle of the building: the branches as translucent neon glass strands braided round each other up the elevator core (the floors are open round it, and follow it when the building is spread apart), forking and merging at their real commits with a crystal bead for each, and above the roof a flowering crown that history builds tier by tier, in a bank of clouds; it builds itself on first view, a hover card names a commit or a flower (its tier's dates, commits, merges, authors), and a toggle (off on phones by default). The commit graph now also carries each author.
- Control plane (Fastify, SQLite) with roles, idempotent commands, an event log, tasks, messages, rooms, reviews, approvals,
  schedules, knowledge review, skills, integrations, A2A gateway, backups and a typed HTTP API.
- Independent runner: Git worktrees, Codex and Claude native execution, MCP tools, interactive terminals, read-only
  observation, verifiers and a durable journal.
- Read-only discovery of local Claude Code and Codex sessions, with liveness (active, idle, dormant, orphaned, zombies), role
  classification, hooks, and one-tap stop and zombie-reap actions.
- Terminal agent-state detection (working, waiting for you, idle) from the bottom of a managed terminal's screen.
- 3D office with eight animal characters, a ghost and a jiangshi, a camera director, communication links and a screen on each
  desk that shows what the session is really doing.
- Responsive React workbench for desktop, tablet and phone, including a full-screen 3D phone layout, with a token-based design
  system and a lint that enforces it.
- Blender pipeline for the animals with a desk-and-chair clipping audit, a loop-seam check and a review renderer.
- Pair a phone by scanning a QR code (`pnpm run pair` or Settings): one-time, five-minute, server-enforced; a remembered device keeps
  its session for 30 days; one code and one QR code however many network addresses the computer has (the best address first, the
  others listed and selectable in Settings), a terminal QR code that is a clean block with a quiet zone, and an end-to-end test of
  the whole scan; the animal models download 30% lighter.
- Claude subscription limits in the top bar, read from an existing local file.
- Verification ledger and generated report.

- Members working hard type faster, their screens stream and, flat out, smoke and spark; screens are themed per department; the
  director cuts faster with many busy members and wide screens show a control-room wall of live views of the others.

- Working members show their latest prompt (blue) and reply (mint, typed out when new) as two bubbles over their heads: up to six
  at once, only the selected or filmed member on a phone, hover to read it all. Served to owner and operator only, redacted and
  truncated, never stored (`GET /api/local-sessions/speech`); `?speech=1` previews it with stand-in text.

### Changed

- The session panel can be resized: drag the handle on its left edge (or use the keyboard on it) between 320px and 720px (at
  most 60% of the window); a double-click resets it, and at the default folds it to a 48px rail with needs-you and unread badges.
  The width is kept per browser and the 3D office follows it live. Inside, the panel adapts to its own width (a two-column
  feed from 560px, compact under 360px).
- Session panel polish: a Feed | Session header with a context meter, feed rows with a status rail and sticky foldable groups, a
  friendlier empty feed, 14px conversation text with code blocks (language, copy, coloured diffs), tool-call chips with duration,
  a "jump to latest" pill and skeleton loading, an auto-growing composer with key hints on its lists, and a permission card with
  its time left as a thin line.
- "Create task" and "Edit layout" on the office page are behind Settings → Advanced features, like the pages they open.
- One unread count: the top bar, the sidebar readout and the panel badge all show sessions waiting on you plus finished ones
  you have not opened (the feed's own definition, remembered per session in this browser).
- The notification switch moved from the Approvals page to Settings and now covers sessions as well as approvals; the pairing
  panel moved from Settings to the top bar.
- The panel beside the 3D office is a live session workspace instead of an identity card. With nothing chosen it is a feed of
  every observed session in four groups (needs you, working, recently finished, idle), each row with the newest assistant
  reply, the running tool or what it waits for, the time, and an unread dot (kept per session in this browser). A chosen member
  opens its conversation first: turns with the prompt, the reply as Markdown and every run of tool calls folded into one line
  ("read 4 files · edited 2 · ran 1 command"), following the newest message with a "N new" pill when you have scrolled up, and
  refreshing only while the page is visible. The directory, process, CPU, branch and the rest sit in one closed fold at the end.
  A session started in a terminal gets an honest read-only foot (copy resume or fork command) instead of a composer, with a
  slot for the composer of a session AETHER can drive. On a phone the panel is a bottom sheet with a 72px peek (session chips
  and the newest reply line), a half-height feed and a full-height conversation. The transcript endpoint now returns each
  tool call's id and a short redacted target, and the last 120 entries.
- "Show in office" links and feed rows of another project now bring the camera to the member on a phone too (the focus request
  was only handled on the desktop page).
- Desk screens show the session's last eight tool calls from the hook spool (a file's base name, a command's first word,
  redacted and bounded; never full commands or arguments) as editor tabs and diff bars, shell lines, a git graph, test bars,
  search results and a web outline, with the running tool's elapsed time and a blinking cursor; idle members show a dim lock
  screen. Hooks need no reinstall; spool records written earlier carry no targets.
- Seated arms rest naturally on the desk; gestures no longer start with the arm doubled up; tails are smooth tubes with five
  bones and no longer pass through the chair.
- The automatic camera is calmer: each shot is one slow, short dolly (no orbit, no zoom, level horizon) that the camera is
  placed on rather than chased, shots are held longer, near shots glide and distant ones are hard cuts, a member or pair
  is not shown again for 30 seconds, and a pair is always framed from the same side. A touch on the camera ends a flight
  at once.
- The split view is a control-room wall of up to four live views with neon corners, scan lines and a load meter; its frames
  set where each view is drawn, so they stay in step at any canvas size or pixel ratio, name tags stay out from under
  them, they follow their floor and the spread-apart building, and the shadows are not drawn again for each.
- A sleeping member folds forward over the desk with a cheek on the forearms and breathes slowly; an idle member's branch
  beam is thin, cool and dashed and breathes, where a working member's beam stays bright and streams.
- The upstream agent-office application was removed from the tree; its attribution is kept in THIRD_PARTY_NOTICES.md.

### Fixed

- The camera's close-up shots now push in. The orbit controls' nearest distance (4 m) was farther than a close-up's own
  framing, so the controls held the camera still for the whole shot and the dolly never ran; each close-up now starts 1.1 m
  farther back and ends on the same 4 m framing.
- Members sent home walk with planted feet: the walk clip's stride covers 0.9 m of floor per second at normal speed, but they
  moved at 1.5 m/s, so their feet skated. They now walk at 1.2 m/s with the clip played at the matching rate.
- A name tag that would sit under a speech bubble is hidden instead of drawn over what the member said.
- The control-room wall no longer disappears at 1440x900 when an observed session is listed: its team chip wrapped the name
  onto two lines, which made the strip below the office 20 px taller and the scene shorter than the wall's 540 px minimum. Names
  and roles in the strip are now one line each, cut with an ellipsis (the full text is the chip's tooltip).
- Pointing at the spire's crown works again: the top bead of every strand had a size of NaN (it had no bead above it to measure
  against), which made every pointer move over the scene report a commit instead of the tier under it. The crown's glass is also
  a little dimmer, so twelve stacked decks no longer burn to white.
- Members beyond a floor's 48 desks no longer vanish from the 3D office: they take a desk on the next floor with room (a
  floor's own members always come first), and the scene, the camera and "show in office" follow the member's actual desk.
- The control-room wall's live views no longer go black: when the wall's members changed, the frames that only shifted
  position were re-inserted and replayed their dark power-on dip, hiding a picture that was drawn correctly. Each view now
  keeps its slot and a newcomer takes the vacated one.
- The office chairs no longer flicker: the seat's top and the cushion's top were the same plane, so the depth buffer picked one
  at random; the seat now sits 5 mm below the cushion.

### Security

- Host/Origin allow-list for local-network access, CSRF protection, scoped per-run MCP credentials, secret redaction,
  SSRF-guarded outbound fetches, no permission bypass.
