# Feature notes

Behavioral notes for capabilities that are not obvious from the UI. The authoritative per-capability status is the
[verification ledger](verification/report.md).

## Navigation: the Advanced switch

The sidebar, the phone's tab bar and quick open (Ctrl/Cmd+K) show the pages a CLI user needs: office, local sessions,
approvals, terminals, history and settings. **Settings → Advanced features** adds the pages for orchestrating several agents
(tasks, results review, team, knowledge, messages with rooms and meetings, execution hosts, external observation, workspaces,
and in Settings the schedules, A2A clients and integrations). The switch is per browser, off by default, and only hides
navigation: every page still opens by its address. External observation, meeting rooms and reservations were not removed:
they have a runner, API, ledger and test footprint, so they sit behind the same switch.

## Settings

Eight groups: General (language, theme with System, motion, quality), Notifications & approvals, Connections (phone pairing,
install as an app, address and HTTPS), Models & execution (detected models, local sessions, execution policy, terminal commands),
Office, Advanced (the switch, schedules, A2A, integrations, hosts), Data & privacy (what is stored where, export or reset the
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
signed answers and the plain-HTTP tradeoff for a phone are in [security](security.md#safety-properties).

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
a compaction plays a short effect and a chip. Both come from the local session scan (`GET /api/local-sessions/speech`,
`usage.contextPct`, `usage.compactedAt`) and nothing is stored.

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
