# Feature notes

[Documentation](README.md) · [Project](../README.md)

<details>
<summary>Contents</summary>

- [First run, language, titles and the keyboard](#first-run-language-titles-and-the-keyboard)
- [Navigation: the Advanced switch](#navigation-the-advanced-switch)
- [Settings](#settings)
- [Notifications](#notifications)
- [Connecting a phone](#connecting-a-phone)
- [Task dependency graph](#task-dependency-graph)
- [Project knowledge and human review](#project-knowledge-and-human-review)
- [Agent review](#agent-review)
- [Interacting with the characters](#interacting-with-the-characters)
- [The session panel and the composer](#the-session-panel-and-the-composer)
- [Answering permission prompts (Remote approvals)](#answering-permission-prompts-remote-approvals)
- [Text in the conversation: wrappers, notices and Markdown](#text-in-the-conversation-wrappers-notices-and-markdown)
- [Token and Git KPIs](#token-and-git-kpis)
- [Detected models](#detected-models)
- [The first-visit tour](#the-first-visit-tour)
- [Clock out](#clock-out)
- [The repository in the office](#the-repository-in-the-office)
- [Speech bubbles, context and compaction](#speech-bubbles-context-and-compaction)
- [Office life: little moments in the 3D office](#office-life-little-moments-in-the-3d-office)
- [Observed sessions on the 3D floor](#observed-sessions-on-the-3d-floor)

</details>

Behavioral notes for capabilities that are not obvious from the UI. The authoritative per-capability status is the
[verification ledger](verification/report.md).

**Contents.** What you see and use: [First run](#first-run-language-titles-and-the-keyboard) · [Navigation](#navigation-the-advanced-switch) · [Settings](#settings) ·
[Notifications](#notifications) · [Connecting a phone](#connecting-a-phone) · [The session panel and the composer](#the-session-panel-and-the-composer) ·
[Text in the conversation](#text-in-the-conversation-wrappers-notices-and-markdown) · [Answering permission prompts](#answering-permission-prompts-remote-approvals) ·
[Clock out](#clock-out) · [KPIs](#token-and-git-kpis) · [Models](#detected-models). The office: [Interacting with the characters](#interacting-with-the-characters) ·
[The repository in the office](#the-repository-in-the-office) · [Speech bubbles, context and compaction](#speech-bubbles-context-and-compaction) ·
[Office life](#office-life-little-moments-in-the-3d-office) · [The first-visit tour](#the-first-visit-tour) ·
[Observed sessions, roles and squads](#observed-sessions-on-the-3d-floor). The orchestration workbench (behind Advanced):
[Task dependency graph](#task-dependency-graph) · [Project knowledge](#project-knowledge-and-human-review) · [Agent review](#agent-review).

## First run, language, titles and the keyboard

- **Nothing running yet.** With no project, or no character and no session anywhere, the office page is a calm panel: what
  AETHER shows, three steps (start `claude` or `codex` in a project folder; the character appears within seconds; optionally
  install the hooks), the commands with copy buttons, `pnpm run doctor` for when it does not show up, and "Create a project by
  hand" as a secondary action. With exactly one session in live mode a one-line note says what the speech bubbles and the
  figures wait for.
- **Language.** The first visit follows `navigator.language` (anything starting with `zh` is Traditional Chinese, the rest
  English), the login page and the document `lang` included. The choice is stored with the other preferences and a saved
  preference is never overridden.
- **Addresses.** A project in the address that this person cannot open (stale, mistyped) falls back to the first project with a
  short notice; an unknown page shows "Page not found" with a link home (an unknown Settings group still opens the Settings home). Errors that cannot be
  retried (a missing project, 404) have no Retry button.
- **Tab title.** `<page> · AETHER OFFICE` in the interface language, with the count of things waiting for you in front.
- **Keyboard and screen readers.** The first Tab stops on "Skip to main content", which moves focus to the `main` landmark
  (navigation, main and the session panel are labelled landmarks). The 3D canvas is an image named "3D office" and described by
  one sentence ("12 characters on 3 floors: 2 working, 1 waiting for you") in a polite live region that changes only when a count
  does. A screen-reader pass is still not done (ledger A11Y-08).
- **Forms.** Create task and Propose knowledge (and the login) check required fields themselves: a `*` on the label and an
  inline message in the interface language instead of the browser's native bubble. The task's version and id sit behind a
  "Details" fold. The layout editor is labelled experimental and docks at the side so the scene stays visible while you edit.

## Navigation: the Advanced switch

The sidebar, the phone's tab bar and quick open (Ctrl/Cmd+K) show the pages a CLI user needs: office, local sessions,
terminals and settings. A tool permission waits in its own conversation and in the needs-you banner, so the approvals inbox and
the event history sit behind the switch too. **Settings → Advanced features** adds those and the pages for orchestrating several
agents (tasks, results review, team, knowledge, messages with rooms and meetings, execution hosts, external observation,
workspaces, and in Settings the schedules, A2A clients and integrations). The switch is per browser, off by default, and only
hides navigation: every page still opens by its address. External observation, meeting rooms and reservations were not removed:
they have a runner, API, ledger and test footprint, so they sit behind the same switch.

## Settings

Eight groups: General (language, theme with System, motion, quality), Notifications & approvals, Connections (phone pairing,
install as an app, address and HTTPS), Models & execution (detected models, local sessions, execution policy, terminal commands),
Office (view, camera, beanstalk, animations), Advanced (the switch, schedules, A2A, integrations, hosts), Data & privacy (what is stored where, export or reset the
browser's preferences, sign out) and About (version and mode, shortcuts, links). Search with `/`; `/settings/<group>` opens a
group. See the [design system](design-system.md#settings).

## Notifications

On by default and kept per browser (Settings → Notifications & approvals). They fire when a local session stops on an approval or a
question, when an approval waits, and when a turn of a minute or more ends while the tab is hidden. They carry the project's name
and never a prompt, a reply or a file; a tap opens the session. The browser's permission prompt appears on the first click
or key press, never by itself; if it is refused the same alerts appear inside the page. The tab title and the sidebar and tab
badges carry the count of what needs you.

## Connecting a phone

The top bar's **Open on your phone** button opens the pairing QR from any page. When the control plane starts with
`AETHER_HOST` set it prints the addresses and a one-time QR code (the same as `pnpm run pair`); without it, it prints one line
saying how to enable LAN access. The connection is plain HTTP, which the dialog and the terminal both say. The code stays
single-use, five minutes, and in the link's fragment.

## Task dependency graph

The Tasks page offers a list, a board and a dependency graph. Arrows point from a prerequisite to the work that follows it. The
graph uses the control plane's tasks and dependency data, never guesses from chat. It can be zoomed and fitted, and a node opens
its details by mouse or keyboard; the details also list prerequisites as text.

- An owner or operator may change prerequisites of `ready` or `backlog` tasks before the first assignment. The backend checks
  `expectedVersion`, same-project references, missing nodes, duplicates and cycles, then updates dependencies, version, status
  and events together. A task is `ready` when every prerequisite is `completed`, otherwise `backlog`. Assigned, run or
  terminated tasks cannot rewrite their dependency history; agents cannot change existing dependencies.
- The graph is read-only; edits happen in the task details form. Editing dependencies never starts a model.
- Cancelling a task cancels, in the same transaction, the not-yet-run waiting tasks that depend on it (a diamond is cancelled
  once). Each stores `cancelCause`, a version and its own event. Work that has run or has runs is never overwritten, and a late
  success after cancellation does not revive successors. Cancelling does not undo the chain; continuing means re-planning.

## Project knowledge and human review

Knowledge is isolated by project ACL. A proposal stores author, source, version, timestamps and optionally a `workId`,
`artifactId` and `commitSha` (the work and artifact must belong to the same project; `commitSha` is format-checked only, an
unverified reference).

- A new proposal is `proposed`. Only an owner can approve or reject, with a reason (`human_approved` / `rejected`). Agents,
  operators and viewers cannot approve their own. A decision is bound to `expectedVersion`, a repeated command is not decided
  twice, and a reviewed version cannot be silently overwritten. Author, reviewer and reason are kept; the event and receipt commit
  in one transaction.
- The MCP `propose_knowledge` tool only creates a proposal and cites the current session's work. Knowledge never installs a
  skill, runs a command, changes RBAC or grants a tool approval. Human approval and test evidence are different things; there is
  no path that turns a reference string into "test-verified".
- Search supports Traditional Chinese substrings and shows the latest 100 matches. A full index, revision and withdrawal flows
  and an evidence category are not implemented.

## Agent review

See [native execution](native-execution.md#review-verification-and-acceptance).

## Interacting with the characters

Click a character to choose it; click it again (or right-click, press and hold on a phone, or press Enter on its name tag)
to open its action menu: open the conversation, follow it with the camera, look at its screen, pin it to the wall of small
views, message it, send a quick reply, interrupt it, continue or fork it in AETHER, copy its resume command, stop it or send
it home. Each action is offered only when it can really be done and otherwise shows why (a session AETHER only watches cannot
be typed into; only the owner ends a process; a managed agent has no terminal). Six emotes (wave, thumbs up, high five, cheer,
stretch, pat) are purely visual. Alt + drag carries a member's desk to another seat (validated like the layout editor, saved
through the layout API, with an undo), and Shift + click or Shift + drag picks a group to send home, pin or copy resume
commands for. The design notes and the exact rules are in
[the design system](design-system.md#interactions-with-the-characters).

## The session panel and the composer

The panel beside the office (a bottom sheet on a phone) opens on a feed of every observed session in four groups: needs you,
working, recently finished and idle. Choosing a member opens its conversation: turns with the prompt, the reply as Markdown and
each run of tool calls folded into one line. A session whose process runs inside an AETHER terminal gets a composer (Enter
sends, `/` opens the CLI's commands and skills, `@` completes file paths, Stop interrupts); any other session stays read-only
and offers **Continue in AETHER** or **Fork in AETHER** (only once a runner with `cliTerminals` is connected; otherwise the buttons are disabled and say so), which start a new AETHER terminal with `claude --resume` or
`codex resume`. The panel updates from a server-sent change stream and polls only as a slow safety net. The panel can be
dragged between 320 and 720 px or folded to a rail. Details and the endpoints are in the
[design system](design-system.md#session-panel) and [architecture](architecture.md#the-http-surface).

## Answering permission prompts (Remote approvals)

Off by default. With `pnpm hooks install --remote-approvals` and the owner's switch in Settings, a Claude Code permission prompt
is also shown in the panel as a card (Allow once, Allow for this session when Claude offered a rule, Deny with a reason). Only a
button press decides; with no answer, offline or on any error Claude asks in its terminal as usual. The trust model, the
signed answers and the plain-HTTP tradeoff for a phone are in [security](security.md#safety-properties). The Approvals page
lists the pending requests too; when none waits, its empty text says whether Remote approvals is on.

## Text in the conversation: wrappers, notices and Markdown

Agents write Markdown, CLIs wrap text in XML-style tags and sometimes leave HTML. The server cleans it once; the page draws
it with typed renderers and never as HTML ([design system](design-system.md#text-pipeline), [security](security.md#text-from-agents-is-never-html)).

- **Wrappers are never shown as code.** Any XML-style tag outside code (`<task-notification>`, `<system-reminder>`,
  `<function_results>`, a stray `</div>`) is removed; `Array<string>` and placeholders such as `<your-key>` stay text.
- **The ones that carry meaning become chips** (notices): a finished background task with its real exit code (green only for
  exit code 0), a slash command, command output, "Context added" (one chip that opens into the sanitized text), a hook, "Interrupted
  by user". Task ids and output paths are never kept.
- **HTML an agent left in a message** (`<span class="tx">`, `<br>`, tables, `&nbsp;`) becomes Markdown or text; titles are
  cleaned and shortened on a meaning boundary with balanced brackets.
- **Reading tools:** day lines, "New since you looked", relative times, copy as Markdown or plain text, code blocks with a wrap
  switch and line numbers, find (Ctrl or Cmd+F), `j`/`k` and `g g`/`G` between turns, a compact density.

## Token and Git KPIs

A strip over the office shows tokens today (with a week's sparkline), sessions running, commits today and branches merged this
week. It opens a dashboard (a side panel; a bottom sheet on a phone) for the building and for each floor: tokens by kind (input,
output, cache read, cache write, reasoning), per day for today, 7 and 30 days, by model, by project, the heaviest sessions,
Claude's and Codex's rate-limit windows as rings with the reset time, and commits, merges, merged and open branches, authors, lines
and the oldest open branch. Each floor of the switcher shows its tokens today.

- **Counted locally and incrementally** from the transcripts (appended bytes only, a numbers-only rollup in the data directory,
  history read in the background); the dashboard says when a scan is still reading history.
- **What the numbers do not cover is said on the page.** Offices hold running sessions and the newest 60 only: what no office
  holds is shown as "Not placed in an office" (offices plus that line are the building total). A warning shows when the file cap
  cut the history short (how many transcripts are counted of how many exist), when files could not be read or lines could not be
  placed, and when the Git figures hit their commit cap or leave out projects. "Session time" is the minutes of every session
  added up, so side-by-side sessions overlap and it can exceed the clock. Each rate-limit ring shows the age of its reading and
  turns "out of date" after 15 minutes. A transcript the CLI deletes drops out of the numbers of its days.
- **Tokens, not money.** No price table exists on the machine, so no cost is shown. The headline number excludes cache reads, which
  dominate every session; they appear in the breakdown.
- **Owner and operator only** (`GET /api/usage`, `GET /api/usage/git`); with `AETHER_LOCAL_SESSIONS=off` the dashboard says so and
  shows zeros. Design notes: [design system](design-system.md#kpi-dashboards).

## Detected models

**Settings → Models & execution** lists the models Claude Code and Codex offer on this machine, with effort levels, where the
answer came from (a cache file, the CLI or a built-in fallback) and whether it is stale (after 7 days). It reads the CLIs' own
cache files and never writes under `~/.claude` or `~/.codex`; the aliases `fable`, `opus`, `sonnet` and `haiku` are always
listed.

## The first-visit tour

On a first visit the camera plays a 46-second tour: a slow orbit of the building, the exploded view, a rise up the spire to the
flowering crown, then back to the start view. It plays once per browser session (once ever on a phone) and never under browser
automation. Any input stops it where the camera is, Esc lands on the start view, "Don't show again" turns it off, and with
reduced motion it is three still views. **Replay** is in the floor panel and the phone's controls (Settings → Office has the
preference); the room tour is separate and called "Guided tour (rooms)". `?intro=force` plays it regardless.

## Clock out

Sessions that have sat idle for a day or more can be picked in one dialog and sent home together. The server re-checks each one
(still running, same process, idle long enough, an owner's project) and ends only that process: `SIGTERM`, then `SIGKILL` after
5 seconds. Transcripts are never deleted. The office shows the members packing up and leaving by the elevator.

## The repository in the office

When a project has a Git repository, its branches rise through the middle of the building as braided strands of glass, one bead
per commit, and the history builds a flowering crown above the roof: one flower per tier of twelve commits and a great bloom on
top. The data comes from `GET /api/projects/:id/git-graph` (subjects and authors redacted and bounded). A hover card names the
commit or the tier. It is on for a desktop and off on a phone by default. See the [design system](design-system.md#the-beanstalk).

## Speech bubbles, context and compaction

Working members show their latest prompt and reply as two bubbles (up to six at once; only the selected or filmed member on a
phone). Each desk has a gauge for the share of the model's context window in use, which turns amber from 60% and red above 85%;
a compaction plays a short effect and a chip. Claude's transcript does not record the window, so it is a 200k window assumed (a
`[1m]` model id or a model catalog entry says otherwise) and, once the context is past 200k, inferred to be 1M: the gauge's
tooltip says which, because the percentage falls where the window changes. A turn the CLI wrote for an API error (`<synthetic>`,
no tokens) is skipped, so the gauge shows the last real turn, or nothing, never 0%. Both come from the local session scan (`GET /api/local-sessions/speech`,
`usage.contextPct`, `usage.compactedAt`) and nothing is stored.

## Office life: little moments in the 3D office

Small, decorative animations that follow what a session does. They are pictures, not facts. Each wave-1 effect says what a
command was _started_ as or what state a session is in, never whether it passed or was pushed. The wave-2 outcome moments (below the
table) start only when the provider _stated_ how a command ended (Claude's `PostToolUse` or `PostToolUseFailure`, an `is_error`
in the transcript, a Codex exit code); when the outcome is unknown nothing shows. The hidden live region "Office activity
(decorative)" announces each one, at most one line per 5 s, in the page language.

| Effect                 | Fires on (from the hook records and the scan)                                                     | Lasts | Cooldown          | Kind             |
| ---------------------- | ------------------------------------------------------------------------------------------------- | ----- | ----------------- | ---------------- |
| Rubber duck            | working, no tool running, nothing heard for 45 s                                                  | 18 s  | 10 min per member | Wellbeing        |
| Test lamp and bug      | a test command starts (`pnpm test`, `vitest`, `pytest`, `go test`, `cargo test`, ...); amber only | 14 s  | 5 min per member  | Tests and builds |
| Install disc           | an install command starts (`pnpm install`, `npm i`, `yarn`, ...)                                  | 20 s  | 10 min per member | Tests and builds |
| Rocket or paper plane  | a `git push` command starts                                                                       | 2.6 s | 10 min per member | Git              |
| Pager bell             | a member's state turns to error                                                                   | 3 s   | 5 min per member  | Ops              |
| Coffee steam           | a session that began 2 h or more ago starts working                                               | 4.5 s | 45 min per member | Wellbeing        |
| Loop ring              | the same command ran 4 times in 2 minutes                                                         | 8 s   | 10 min per member | Memes            |
| Copy and paste keycaps | a fetch of Stack Overflow, Super User or a Stack Exchange site                                    | 2.4 s | 30 min per member | Memes            |
| `:q!` sign             | `vim`, `vi` or `nvim` starts                                                                      | 4 s   | 1 day per member  | Memes            |
| Pile of boxes          | 20 or more uncommitted files for 30 minutes                                                       | 45 s  | 10 min per member | Work             |
| Stand-up circle        | a member idle 5 minutes while 3 or more are idle on the floor                                     | 12 s  | 1 h per floor     | Social           |
| Confetti               | the viewer types the Konami code                                                                  | 4.5 s | once a day        | Easter eggs      |

**Wave 2** adds fourteen more, each from a stated outcome or a command label: a green lamp and a squashed bug when a test
command exited successfully, a red lamp and a scurrying bug when it failed, a CI stack for a watch command's exit status, a red
squiggle for a failed build or typecheck, a rocket (now only from a push that exited successfully), danger stripes for a force
push, a tug-of-war for merge conflicts, a launch pad for a deploy (and a Friday sign on a Friday afternoon), a bandaged skull
gag for `rm -rf`, `sudo` and `curl | sh` chips, "works on my machine", "not a bug, a feature" and an LGTM stamp for a real pull
request approval. A member's conversation has a closed "Recent moments" fold. `404` and `418` effects are not built (no real
data to drive them). The labels come from the hook receiver's closed list of 23 command tags
([provider compatibility](provider-compatibility.md#signals-for-the-office-what-each-provider-gives-what-is-derived-what-is-missing)).
Without hooks the wave-1 effects that need a command do not fire and the outcome moments never do.

A member shows one at a time, a floor two, and the building at most three starts in any minute; out of view an effect fires at
half chance, and at the default "rare" frequency memes and social moments at half again. Settings → Office has Calm mode (every
kind off; on by default when the system asks for reduced motion, and a switch in the phone drawer), a switch per kind, the
frequency and the intro tour. With reduced motion an effect is a still picture or, for those that are only motion (steam, the
circle, confetti), nothing; the low quality tier shows none. The design is in [office-life.md](design/office-life.md#53-registry);
`?preview=life&effect=<id>&t=<ms>` holds one frame for a contact sheet.

## Observed sessions on the 3D floor

Sessions are placed on a floor and desk by the engineering role their work belongs to, decided on the server from what the session did, its
title, prompt, branch and subagents, with a confidence and the reasons (see [roles](roles.md); the text it was decided from is never sent). A dormant session is a sleeping rabbit, an orphaned one a ghost,
and zombie processes under a session appear as a jiangshi behind the chair. A member's screen shows what its session is really
doing (title, repository and branch, uncommitted changes, state, the tool in use, context used, quiet time and ports), and
nothing that is not known.

A session's subagents carry their lifecycle: when each started and ended, whether it waits for a permission, and how many tools it
ran. Claude Code reports this through hooks (`SubagentStart`, its `PreToolUse` and permission events with an `agent_id`, then
`SubagentStop`); Codex children are spawned rollouts, started at their `session_meta` time and finished once nothing has been written
for two minutes. A finished subagent stays in the list for 90 seconds, then goes. `hook.recent` marks a helper's call with its
`agentId`, and every call carries `tags` (labels from a closed list such as `test`, `git.push.force` or `fs.rm.recursive`: what kind
of command it was, never its arguments) and `ok` (whether it succeeded, `null` while not known). Claude subagents are also read from
their own transcript files (`<session>/subagents/agent-<id>.jsonl`), so they are seen without hooks too (running, or finished after two
quiet minutes), and every Claude subagent gains a `label` (the Task description), its `tokens` (total and per minute) and, once finished,
a `result` (its last words as plain text, at most 160 characters, secrets redacted). A session's `git.conflicts` counts its unmerged
files. A Codex child has no tool count, tokens or result.

In the session panel a supervisor and its subagents read as one group, without the 3D scene: the supervisor's feed row carries a
chip ("3 subagents · 2 working") and folds open to nested rows (status, type, how long, tool calls, "waiting for approval"),
a finished row dims for its 90 seconds, and the whole group is a keyboard-navigable tree. The supervisor's conversation has a
squad strip of chips and a "Subagent activity" card per spawn (with that subagent's own recent calls); a subagent's own view has a
"Spawned by" link back. Their portraits share an accent and a subagent's carries a tether glyph. A Claude session working without
hooks explains that its subagents need the hook and offers the command. See
[Squads in the panel](design-system.md#squads-in-the-panel).

In the 3D office a session's subagents sit together in a squad zone beside its desk, one pod each, facing the supervisor. The zone is
placed automatically (a saved one, see the layout editor, wins) and grows at once but shrinks only after ten quiet seconds; a pod
is kept for as long as its subagent holds it. A new subagent walks in from the elevator core (when the pod is within 14 m on high
quality, 10 m on balanced; otherwise it appears in its seat) and sits down; a finished one, or one the session stopped reporting,
stands, waves and walks back into the core. Past eight subagents on high (six balanced, four low) the rest stand as silhouettes and
the zone label counts them. A funnel of light runs from the zone into the core and a filament on to a halo over the supervisor; its
brightness follows the squad's tokens per minute (Claude subagents, read from their transcripts) and otherwise its tool calls per
minute; the zone label's tooltip says which. The zone label is a button ("Squad of main, 3
working") and a hidden live region announces who joined and left. Thin strings of light run from a control cross over each working subagent to its head and hands
(they tighten and jerk on each tool call, go slack when it rests, and are off on the low tier, with the relation effects or with
their own switch, Settings, Office, "Puppet strings"; still in Calm mode and with reduced motion). When a subagent finishes, it
walks a folder to its supervisor's desk, puts it in the in-tray and the supervisor reads it and stamps it **RECEIVED**: a receipt that a
result came back, not an approval. A result the parent's own tool result flags as an error gets a grey **RETURNED** stamp instead
(never red or green). The log says "Explore handed over its result". A subagent's result summary is not shown in 3D. If the floor has
no room for a zone the subagents keep desks of their own and the tether between desks still joins them.
