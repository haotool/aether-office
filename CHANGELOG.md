# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it has a stable release.

## [Unreleased]

Pre-release development (`0.4.0-dev`).

### Added

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
