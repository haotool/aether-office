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

## Notifications

On by default and kept per browser (Settings → Notifications). They fire when a local session stops on an approval or a
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

## Observed sessions on the 3D floor

Sessions are placed on a floor and desk by the engineering role their work belongs to, decided on the server from the session
title and context (the text it was decided from is never sent). A dormant session is a sleeping rabbit, an orphaned one a ghost,
and zombie processes under a session appear as a jiangshi behind the chair. A member's screen shows what its session is really
doing (title, repository and branch, uncommitted changes, state, the tool in use, context used, quiet time and ports), and
nothing that is not known.
