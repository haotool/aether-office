# Design system

The web UI is built in three layers: **tokens → components → features**. The rules below are checked by
`pnpm lint` (design tokens), `e2e/responsive.spec.ts` (every page at 320, 390, 820, 1194, 1280 and 1366 px, and a phone
on its side) and `e2e/ui-sweep.spec.ts` (axe accessibility, both themes). A UI change is done when those pass and the
changed pages have been looked at on a phone-sized and a tablet-sized screen.

## Tokens

`apps/web/src/styles/tokens.css` is the **only** file allowed to hold a raw color, type size, space, radius or z-index.
`scripts/check-design-tokens.mjs` (part of `pnpm lint`) fails on a raw value anywhere else in the stylesheet.

| Family     | Tokens                                                                 | Notes                                                                                   |
| ---------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Spacing    | `--space-2` … `--space-64`                                             | 4px grid with 2px and 6px half steps; used by `padding`, `margin` and `gap`             |
| Radius     | `--r-xs` … `--r-3xl`, `--r-pill`                                       | A circle is `50%`                                                                       |
| Type       | `--fs-label` (11), `--fs-small` (12), `--fs-meta`, `--fs-body` (14), `--fs-lead` … `--fs-hero` | No visible text under 11px; readable text is 12px or more                       |
| Layers     | `--z-*`                                                                | Named, ordered layers: scene overlays below page chrome, sheets on top                  |
| Color      | theme tokens (`--bg`, `--surface`, `--text`, …) and `--glass*`, `--on-glass*` | The glass set is for what is drawn over the 3D scene, a night view in both themes |
| Touch      | `--target-touch` (44px hit), `--control-touch` (40), `--control-touch-sm` (36), `--target-fine` (32), `--safe-*` | Hit area, drawn control sizes and the notch and home-bar insets |

## Stylesheet organization

`apps/web/src/styles/index.css` loads the files in cascade order: tokens, base, shell, office, session panel, controls,
pages, forms, views, login, the desktop breakpoints, the feature files (scene HUD, telemetry, transcript, git, sessions,
quick open) and finally the touch and phone layers. A rule goes in the file of the thing it styles, never in a catch-all.
The file list is documented at the top of `index.css`.

## Components

Shared pieces live in `apps/web/src/ui.tsx`: `Modal`, `Sheet`, `Fold`, `Hint`, `Clamp`, `Field`, `Badge`, `Empty`,
`PageHeading`. A feature composes them instead of rebuilding a portal, a backdrop or a close button. Buttons are the
classes `primary`, `secondary`, `icon-button` and `text-button`; a new variant is added beside them in `controls.css`.

## Responsive and touch rules

1. **Width.** A phone is `<= 760px` or a phone on its side (`pointer: coarse` and `max-height: 500px`). There, navigation
   is a drawer and the session panel a bottom sheet. Nothing scrolls the page sideways. A table that is wide on purpose scrolls
   inside `.table-scroll`; a table of rows becomes cards on a phone (`table.stack`, with a `data-label` on every cell).
2. **Type.** Body text is 14px; form fields are 16px on a phone (iOS zooms the page on anything smaller).
3. **Targets.** With a finger a control is drawn 36px (icons, segments, chips) or 40px (buttons, fields) and is hit at 44×44: an
   invisible area reaches past its edges (`touch-targets.css`), and a checkbox is reached through its row. The responsive spec
   enforces the drawn size (36); with a mouse at least 32.
   Overlays that duplicate another way to do the same thing (the name tags on the 3D scene) are exempt. Hover styles live
   under `@media (hover: hover)` so a tap does not leave a control looking hovered, and controls set
   `touch-action: manipulation`.
4. **Screen.** Use `100dvh`, never `100vh`, and take padding from `--safe-*`.
5. **Cut off.** Nothing is clipped by an ancestor that does not scroll. A short screen (an iPad on its side) still reaches
   the last link and the sign-out button, and a label never wraps letter by letter.
6. **Plain HTTP.** A phone reaching the server over the LAN has no secure context: no `crypto.randomUUID`,
   `navigator.clipboard` or service worker without a fallback (`browser-compat.ts`).

## The 3D scene on a phone

- The scene works by touch and fits a portrait screen (`fittedOffset`). On a phone it _is_ the page: it fills the screen
  between a slim top bar and the tab bar, with no heading, stats or panels over it. Only a floor rail, a few round buttons,
  one chip and, for the member in hand, one slim bar are drawn over it. Names are hidden until asked for. The 2D list is
  always one tap away.
- Rendering is lighter on a phone: no shadows, no antialiasing, pixel ratio ≤ 1.5, smaller models, about 20 frames a
  second when idle, and no rim light.
- Dialogs and sheets put what you act on first and fold the explanations (`Fold`, `Hint`, `Clamp`). Sheets stand on the
  lower half of the screen (56dvh; the session sheet is described below) and render into `document.body`.
- **The camera runs itself.** The director (`packages/office-scene/src/director.ts`, `shot-camera.ts`) cuts to who is
  talking (a two-shot with an arc between them), who waits on a person or is in error, who works, and who wants a person
  (forgotten, ownerless, zombies), and sweeps a floor when nothing is going on. A touch, a chosen member or a focus
  request hands the camera to the person; after a quiet spell (10 s on a phone, 30 s elsewhere) it takes it back, but never
  while a member is chosen. It is off under browser automation (`navigator.webdriver`) so tests can hit a still target.

## Session panel

The 3D office stays the home; the panel beside it (a bottom sheet on a phone) is where you follow what each session is
saying and doing. People use it mostly to read the newest progress and conversation, so it opens on a feed, and a chosen
member is a conversation, not an identity card. Code: `features/SessionPanel.tsx` (desktop column, shared `PanelBody`),
`SessionSheet.tsx` (phone), `SessionFeed.tsx`, `SessionConversation.tsx`, `TranscriptView.tsx`, `PanelResizer.tsx`; styles
`session-panel.css`, `panel-resize.css`, `session-feed.css`, `transcript.css`, `transcript-tools.css`, `phone-sheet.css`.

- **Feed (nothing chosen).** One row per observed session of any project, in four groups: **Needs you** (a permission prompt
  or a notification that wants an answer, from the hook state), **Working**, **Recently finished** (idle for under 30
  minutes) and **Idle** (folded). A row is the avatar, the session's title (else its repository), repository and branch, how
  long ago, the newest assistant reply cut to two lines (the same data as the speech bubbles, `/api/local-sessions/speech`),
  and the tool it runs or the reason it waits. An unread dot marks a needs-you or finished row with something newer than the
  last time it was opened (kept per session in `localStorage`, this browser only); an idle row older than two hours fades.
  A row of another project opens that project's office. New events only change the feed, its counts and badges: they never
  change what is selected. The grouping, order, unread and relative-time rules are pure (`feed-model.ts`, `session-seen.ts`).
- **Conversation (a member chosen).** The transcript comes first and is never behind a fold. Messages are grouped in turns
  (`turn-groups.ts`): the prompt as a bubble, the agent's reply as Markdown (rendered as elements, never as HTML,
  `md-parse.ts`), and every run of consecutive tool calls folded into one line such as "read 4 files · edited 2 · ran 1
  command" that opens to the calls with their targets; results are paired by the provider's tool id. The view follows the
  newest message while you are at the bottom; scrolled up, it stays and offers a "N new" pill. It refreshes every 2 s while
  the session works and 6 s otherwise, and not at all while the page is hidden. The header carries the name, state, model and
  context use; the Feed segment of the header returns to the feed with a badge for what else wants a look. Everything else
  (directory, process, CPU, worktree, branch, upstream, uncommitted, role, hook source) is **one closed fold** at the end.
- **Honest about writing.** A session that was started in some other terminal cannot be typed into, so its foot is not a
  composer: one line says so, offers **Continue in AETHER** and **Fork in AETHER** (a new AETHER terminal that runs
  `claude --resume <id>` / `codex resume <id>`, or the fork variant, through the same start path as the Terminals page; the
  original is not touched, and Continue is off while the original still runs) and keeps the provider's own commands (copy
  resume, copy fork). Waiting sessions say that approval happens in the terminal. When the server finds the session's
  process inside an AETHER terminal (`GET /api/local-sessions/:key/terminal`), the foot is the composer instead.
  `SessionFooter` still takes a `composer` node, which replaces both.
- **Composer** (`Composer.tsx`, `composer-model.ts`, `use-drive.ts`, `terminal-driver.ts`; styles `composer.css`). A
  multi-line text box; on a desktop Enter sends and Shift+Enter breaks the line, on a phone Enter breaks the line and Send is a
  button (an IME's Enter is left to the IME). A send is typed into the terminal the way a person would: clear the line
  (Ctrl+U), the body (a bracketed paste when it has several lines, with control characters stripped so it cannot end the
  paste), then Enter 150 ms later, serialized per terminal. The message shows at once as a dashed pending bubble with a
  `localId`; the transcript's own prompt replaces it (matched by text and time, one prompt per message). It waits in a queue
  of ten while the network is down, the session is working, or another person holds the terminal lease, and goes in when the
  way is clear. A sent message the transcript never shows is flagged after 90 s, never left looking delivered. While the
  session works, **Stop** takes the place of Send: Esc, then Ctrl+C 1.5 s later if it still works, then **Stop process**
  (`terminal.stop`, confirmed). On a phone a row of quick replies (continue, yes, no, Esc) sits above the box.
- **Slash menu and @file.** `/` at the start opens a fuzzy list of the CLI's built-in commands, the project's and the user's
  `.claude/commands` and `.claude/skills`; a command that opens a list or dialog in the terminal (`/model`, `/resume`,
  `/config`, `/login`, ...) says so, because it is sent but cannot be answered here. `@` opens file paths of the session's
  directory (Git's view: ignored and credential files left out). Up/Down choose, Tab or Enter fill, Esc closes.
- **Chips.** The model chip shows the session's model and opens the existing `ModelPicker`. Picking sends the CLI's own
  command as a normal message ("applies to the next message"): `/model <id>` for Claude, the bare `/model` for Codex (whose
  own picker applies it). Effort is offered for Claude only (`/effort <level>`); permission mode has no text command in
  either CLI and is not offered.
- **Phone.** A sheet over the tab bar at three heights. *Peek* (72px, always there on the office): a chip for each session
  that wants a look (state dot, unread dot, 44px hit area) and the newest reply line of the most urgent one; with a member
  chosen, the member bar: avatar with its state dot, name, the newest reply line, focus, open, close. *Half*: the feed.
  *Full*: the conversation, back arrow top left, collapse top right. A row opens full, back returns to half, collapse returns
  to peek with the member still in hand. The new-task button and the camera chips stand above the peek. The sheet respects
  the notch and home bar (`--safe-*`); on its side the feed and conversation take a column at the right.
- **Width and rail (desktop).** The panel's left edge is a drag handle (`PanelResizer.tsx`): a 16px hit area with a hairline
  and a grip that show on hover, on focus and while dragging; pointer events with pointer capture (mouse, pen, touch).
  It is a `role="separator"` with `aria-valuenow/min/max`: Left and Right widen and narrow by 16px, Shift by 64px, Home and End
  go to the limits, Enter or a double-click resets to the default and, already there, folds the panel to a rail, Esc during a
  drag puts the width back. Limits and rules are pure (`panel-width.ts`): minimum 320px, maximum the smaller of 720px and 60%
  of the window, a drag within 8px of the default settles on it, and the default is what the panel used to be fixed at (440px
  from 1800px, 320px up to 1250px, else 380px). The choice is a preference (`panelWidth`, `null` = the default) stored in this
  browser; a smaller window clamps what is shown without losing the choice. The width is one CSS variable, `--panel-w`, on
  `.app-body`: while dragging it is written once per animation frame and React does not render, so the office (a flex sibling)
  follows live and the scene's `ResizeObserver` keeps the canvas at its container's size; the width transitions only for keys,
  the rail and Enter, never while dragging and not under reduced motion (`prefers-reduced-motion` or the Settings switch). The
  **rail** (`panelCollapsed`, header button or the double-click above) is 48px: a re-open button and a needs-you badge (amber)
  and an unread badge (outlined). At 1000px and below the panel lies over the office at a fixed width, with no handle and no rail;
  a phone is unchanged (the sheet).
- **Container queries.** The panel's inside follows its own width, not the window's: `.panel-feed` and `.conversation` are
  containers (`container: panel / inline-size`), so the same rules serve the dragged column and the phone sheet. From 560px a
  feed row is two columns (who and where on the left, a longer reply preview on the right) and the transcript gets more side
  room; under 360px the state line and the paddings shrink, and Send, Stop and the model chip shrink to an icon and a short
  name. Assistant text is capped at 72ch so a wide panel stays readable.
- **Feel.** Header: a Feed | Session segmented control (the Feed segment is the back control, with the badge for what else
  wants a look), quiet focus and collapse buttons, the status badge, the model chip and a thin gradient meter for the context
  window; long names truncate with a tooltip. Feed rows have a status rail on the left edge (amber needs you, teal pulsing
  working, blue finished, dim idle), a mono repository and branch chip, the time at the right, sticky group headers with counts
  and groups that fold smoothly; an empty feed says how to start a session. Conversation: 14px body text, a quiet gutter for the
  assistant, timestamps on hover (always on a touch screen), code blocks with the language and a copy button, `diff` blocks
  coloured by +/-, tool calls as slim chips with a shimmer and the time taken (ticking while they run), a "jump to latest"
  pill after a screen of scrolling up, skeleton rows while the first fetch is out. Composer: the box grows from one to eight
  lines, the quick-reply chips scroll sideways, and the slash and @ lists carry their key hints. A permission card shows the time
  left as a thin line along its top edge. Motion uses `--dur-fast`, `--dur` and `--ease` only.
- **Server.** `GET /api/local-sessions/:key/transcript` returns up to 120 entries, each with the provider's tool id (`toolId`,
  also on its result) and a short redacted target (`summary`: a path, a command). Nothing else about the transcript's safety
  changed: key lookup only, bounded tail read, no hidden reasoning, redacted and cut.

## Clock out

- **A dialog (`features/ClockOut.tsx`) opened from the sessions page and, on a phone, from the top of the "needs attention"
  sheet.** It lists running sessions idle for at least a day (a select: 1, 3 or 7 days), all picked at first, with select
  all, clear and invert, a count, and the memory the picked ones hold (from the process scan only; if some have no
  measurement it says so rather than guessing). The primary button names the count; it is disabled with none picked.
- **Three steps:** pick, confirm (what will happen: SIGTERM, SIGKILL after 5 s, transcripts kept, the server re-checks),
  then each session's result, with the reason for each that stays. "Watch them leave" goes to the office.
- **The office shows it.** Members the server cleared stand up, wave, shoulder a bag, walk the free way to the elevator core
  one after another (350 ms apart) and are taken up by it; the desk stays empty. With reduced motion they are simply gone.
  `?clockout=N` previews it on every member after N seconds without stopping anything. Controls are 44 px high and use only
  tokens (`styles/clock-out.css`).

## The beanstalk

The 3D scene draws the repository as a braid of glass trees running up the building's axis, with a crown that history builds
above the roof (`packages/office-scene/src/stalk-layout.ts`, `crown-layout.ts`, `Beanstalk.tsx`, `Garden.tsx`, `Clouds.tsx`),
fed by the existing commit-graph route (`/api/projects/:id/git-graph`, readable by every role that may read the project;
subjects and author names are redacted and bounded to 150 commits). Nothing is drawn without a repository.

- **Through the middle.** The elevator core is the shaft: every floor's slabs are open round it (radius 1.7) and its caps are
  rings, so the braid rises from inside the lowest floor, through every floor and out through the roof. Below the roof the
  strands stay inside the core's glass (radius 1.5), so they never meet the desks or the members walking to the elevator.
- **Strands.** The default branch is the trunk; every other branch (up to 8) is a strand that forks at its parent commit, winds
  round the others like a DNA braid (14 m per turn) and returns to its merge commit; a branch that never merged ends loose and
  thins to a point. Each strand is a glass tube in its own neon hue: no transmission pass, a shader gives it a clear body, a
  fresnel rim, a vein of light down the middle, a slight shift of hue and pulses running up the vein. A commit is a crystal
  bead inside the glass (a merge is larger and white).
- **Growth.** A recent commit is given up to three times the height of an old one along the braid; thickness and the speed of
  the pulses follow the commits of the last two weeks and the branches active in them.
- **The crown.** A flowering tree, not stacked floors: one tier of history per 12 commits (up to 12; a longer window shares
  them), and what is drawn for a tier is a bloom on a stem that leaves the braid at the tier's height and arcs outwards and
  upwards (the lower tiers reach further, so the flowers narrow towards the top), in a hue that turns round the colour wheel
  from its branch's colour, with the great bloom on top. There is no deck, ring or slab geometry. The tier data (index, span,
  commits, merges, authors, branches, shape, seed) stays pure and feeds the hover card. A bank of soft clouds (44 noise-shaded
  sprites, one instanced draw, tinted by the branch hue, drifting slowly) hides the tip; they are not drawn on low quality.
- **First view.** The braid climbs (2.4 s), then the tiers' flowers open one after another from buds (0.4 s apart, 3.2 s each),
  then the clouds gather. A tier that arrives with new commits blooms the same way. With reduced motion or low quality it is
  simply complete.
- **Spread apart.** In the exploded view the braid follows the floors: each floor keeps its own stretch in its own well and the
  strands stretch straight through the gaps; the crown moves up with the top floor.
- **Hover and touch.** The pointer over a strand or a bead shows short hash, subject, author, age and branch chips; over a
  flower, its code, species, the tier (dates, commits, merges, authors) and the seed commit; over a merge flower, the merge's
  subject. A glass card (`.stalk-tip`, tokens only, at most half the scene wide, flipped to the pointer's other side past the
  middle) that never takes the pointer, so orbiting still works. A tap shows it on a touch screen and it goes by itself after 4 s.
- **The garden.** Every tier blooms one flower, each recent merge commit a small one on the braid, and the top ends in a great
  bloom (below).
- **Cost.** Five draw calls (strands, beads, flowers, pollen, clouds), no shadows. A toggle (the sprout button, and in the phone
  drawer) is on for a desktop and off on a phone by default. Measured on an Apple M4 (Metal, 1440x900, vsync off): the
  beanstalk adds 5 draw calls and about 26,000 triangles and costs about 0.1 ms per frame (median 1.0 to 1.2 ms either way).

### The garden (flowers and glass trees on the crown)

`flower-genome.ts` maps a commit hash to a **genome** deterministically (the same data always grows the same flower, a different
one a visibly different flower); `flower-bloom.ts`, `flower-tree.ts` and `garden-geometry.ts` turn genomes into geometry;
`garden-material.ts` and `Garden.tsx` draw and animate them.

- **One flower per tier**, seeded by the tier's first commit: its stem leaves the braid at the tier's height and arcs out and up
  to a head that faces up and out; merges add whorls, many authors add petals, many branches a ring. The **great bloom** on top
  is seeded by every tier's seed and grows from 11 m to 22 m with the length of the history (full at 150 commits). It opens
  over the clouds on a thin stem and is the richest flower: five whorls (13 or 21 petals outside, thinning inwards) of finely
  tessellated glass petals, the outer ones turning their tips back, the inner ones cupped and raised, a heart of light, 89
  florets, a pistil with a bead of light, a crown of 34 beaded stamens, three holographic rings (a thin ring over the petals,
  a hovering band under them, a wide faint ring), 72 orbiting motes and the breathing sway and iridescent edge of every petal.
- **Merge flowers.** Each of the 16 newest merge commits blooms a small flower (one whorl, at most 13 petals, 0.6 to 0.85 m)
  from the commit's hash at its node on the strand, leaning outwards so it shows through the glass; it opens when the braid has
  climbed to it and the hover card says what the merge says. They join the garden's one mesh (no extra draw call), cost at
  most about 3,300 triangles together and are not drawn on low quality.
- **Genome.** Two of eight archetypes (lotus, orchid, lily, composite, tulip, helix, tech-lotus, crystal) are blended by weight
  (the weights sum to 1) in one space of 18 continuous parameters (petal pitch, curl, cup, ruffle, length, width, taper, belly,
  twist, golden-angle turn of the whorls, bilateral lip, floating shards, glass, facets, disc, stamens, vein glow), each jittered
  inside a curated range. Petal counts are Fibonacci numbers (3 to 21, at most 34 petals a flower), floret counts too (13 to 89). No flower is a closed bud: the
  archetype ranges keep every petal pitch above 0.4 rad and a floor on the petals' spread (`spreadOf`, 0.62 of the flower's size)
  opens any that would still read as a bud.
  The branch hue runs to a turned hue at the petal tips. The species name is a genus (the dominant archetype) and one of 24
  epithets; the code name (`L-3C7A`) is locale-neutral.
- **Bloom.** Each flower opens from a bud once its tier has been built: its petals swing about their bases one after another (outer
  whorl first), a little past their final angle and back, then breathe and sway slowly; the stem and twigs grow first, the
  centre lights last. With reduced motion every flower is simply open. Low quality: fewer petal rows, 21 florets, 6 stamens,
  one level of twigs and no pollen.
- **Glass trees.** Tiers with merges (or three parallel branches) put out a small space-colonization tree on their stem
  (Runions et al. 2007: attractor points in a hemispherical envelope over the stem, each pulling the nearest node, branches
  growing one step towards the mean of their pulls with a slight lean to the light, attractors removed once reached; limbs as
  thick as the tips they carry). It is deterministic from the genome, bounded to 300 segments and 40 buds in all (shared evenly
  between the trees, so no tier starves another), and every tip is a five-petal bud in the flower's own shape.
- **Shading.** One shader, no textures or lights: a petal is a gradient from the branch hue with a fan of glowing veins, a
  fresnel rim, an iridescent edge and a fake of light shining through that grows with the `glass` gene. A petal covers a little
  of what is behind it (premultiplied alpha) so it reads against the dark sky; florets, stamen beads and rings add light.
- **Cost.** Two draw calls (one mesh, one points object) and a bounded triangle count: about 24,400 for a 12-tier crown with
  its great bloom and 16 merge flowers (10,600 on low quality, which draws the great bloom with coarser petals and no merge
  flowers), 26,400 at most across the histories tested (the test asserts 28,000).

Research this was built from (techniques only): Vogel's `r = c sqrt(n)`, `phi = n x 137.5 deg` for the florets and the golden
turn of whorls ([Wikipedia, Golden angle](https://en.wikipedia.org/wiki/Golden_angle); Prusinkiewicz and Lindenmayer, *The
Algorithmic Beauty of Plants*, ch. 4 [algorithmicbotany.org](https://algorithmicbotany.org/papers/abop/abop-ch4.pdf)); the
whorl structure of a flower (sepals, petals, stamens, carpels) and the ABC model that blends organ identities by overlapping
gene weights, which is why a genome blends archetype weights instead of switching ([Causier et al. 2010; MPIPZ ABC
overview](https://www.mpipz.mpg.de/25280)); competition-for-space branching ([Runions, Lane, Prusinkiewicz, space colonization,
2007](https://www.algorithmicbotany.org/papers/colonization.egwnp2007.html); here small and bounded, with an upward bend and a
share of the budget for each tree); how parametric flower generators expose petal curvature, tilt, count and sepal/stamen growth as a few dozen sliders
([Blender flower generator docs](https://superhivemarket.com/products/geonodes-flower-gen/docs)); and cheap petal shading by
mixing a translucent term with a fresnel term and procedural vein noise ([Habel et al., real-time translucency for leaves](https://www.cg.tuwien.ac.at/research/publications/2007/Habel_2007_RTT/);
[gamedev.net petal lighting thread](https://gamedev.net/forums/topic/687271-lighting-model-for-flower-petals)).

## Navigation and phone information architecture

First principles: the person is a CLI user who runs Claude Code and Codex in a terminal, and a phone is for glancing,
answering and dispatching, not for administering. So:

- **Two tiers of pages** (`apps/web/src/nav.ts`). The default navigation is the CLI-first set: the office, local sessions,
  approvals, terminals, history and settings. The pages for orchestrating several agents (tasks, review of results, team,
  knowledge, messages, execution hosts, observed sources, workspaces; and in Settings the schedules, A2A clients and
  integrations) appear only when **Advanced** is on (Settings, off by default, stored in the browser's preferences). It is a
  filter on the navigation, the tab bar and quick open, not a gate: their addresses always open. The Playwright suite starts
  with it on; `e2e/advanced.spec.ts` covers the default.
- **Glance.** The office is the home screen. Two chips float on it: *Running* (a green dot) and *Needs you* (the sessions waiting
  for an approval or an answer, then those forgotten or ownerless). Each has an accessible name with its count, a 44px tap
  target and a list sheet; the visible word appears when the screen has room (landscape), a portrait phone shows the number.
- **Answer.** The four tabs are the places a person acts: Office, Sessions, Approvals, Terminals (with Advanced on: Office,
  Sessions, Tasks, Messages). Their badges count what **needs a person** (sessions waiting on a prompt, approvals waiting,
  with Advanced tasks to review and requests nobody acknowledged), never how many things exist. The same count leads the page
  title, so a background tab shows it.
- **Alerts** are on by default and say only the project name: a session needs you (an approval or a question), an approval is
  waiting, and a long turn ended while the tab is hidden. The browser's permission is asked only on the first click or key
  press; without it the alert is a notice inside the page. A tap on a notification opens that session.
- **Open on your phone** is a button in the top bar (and in the drawer on a phone), opening the pairing QR in a dialog with the
  plain-HTTP caveat stated. The control plane prints the same QR at start when `AETHER_HOST` is set.
- **Everything else is behind "More"**, grouped by what a person comes for: *Work*, *Watch* and *System*, with an empty group
  left out. The same groups head the desktop sidebar.
- **Explanations fold.** A page title carries an "i" beside it instead of a paragraph under it (`Hint`, `Fold`, `Clamp`).
- **A member is a row** (avatar, name and role, state), not a card; a table of rows becomes cards (`table.stack`).

## Many busy members at once

- **How hard a member works** is read from real signals (`apps/web/src/features/activity-rate.ts`): how often something changed
  in its session over the last minute, the CPU of its process tree, and how many subagents work for it, giving 0 to 3. It drives
  the typing speed (a flat-out member types at 2.2x), a stream of bars that scrolls over its screen, and at level 3 smoke and
  sparks over the desk and a faint shake. `?intensity=3` in the address previews it with stand-in data.
- **A department's screen** keeps the real facts of the session and dresses them differently per department: its own title
  (BUILD, PIPELINE, CHECKS, ANALYSIS, BOARD) and an abstract ambient column; the pattern is decoration, the text is data.
  A working screen draws the session's last eight tool calls (`hook.recent`, from the hook spool) as rows by kind: editor
  tabs and diff bars for Edit/Write, `$ cmd` for shell, a graph for git, bars for test runs, result bars for Grep/Glob,
  an outline for web; the file names and commands are real, the bars are decoration, and no outcome (pass, exit code) is
  drawn because none is recorded. A footer shows the running tool with its elapsed time. A member that is idle, ended or
  unknown shows a dim lock screen instead. Each screen is one canvas redrawn only when its facts change or on the cursor
  tick (twice a second).
- **The director** favors the hardest worker and holds a shot 8 to 12 seconds (down to 70% of that when many are busy).
  A shot is one slow dolly of at most 4 m along the line of sight: no orbit, no zoom, a level horizon. The camera is put on
  the move at each frame, never chased. A near shot on the same floor is reached by a 1.4 s glide, anything else by a hard
  cut with a 150 ms dip to the night color; a glide never runs back the way the last shot moved. A member or pair is not shown again within 30 seconds (unless
  waiting on a person or in error), and a pair is always framed from the same side (the 180 degree rule). With reduced
  motion the director is off.
- **The control-room wall.** On a wide, tall enough screen (not a phone or tablet, not low quality), when at least two members
  are busy, up to four live views (`MultiCam`, framed by `PipWall`) follow the others beside the main camera, each slowly
  pushing in on its member, with a `CAM n` tag, a load meter, neon corners and scan lines. The stylesheet lays the frames out
  and `MultiCam` draws each view into the rectangle its frame ended up in, so they cannot drift apart; a hidden wall gets no
  renders. Only members on the drawn floor (every floor when spread apart) get a view, name tags are hidden under the
  views, and choosing a view hands the main camera to that member (the director gives way). A view that is still busy stays.

## Loading performance

Text and model files are served pre-compressed (the build writes `.gz` and `.br`), hashed assets are `immutable`, JSON
answers are gzipped, and polling backs off when the event stream is up. A page's first load on a phone stays under 1 MB.

## Verifying a UI change

1. Audit the changed pages on real data at 390, 820 and 1280 px.
2. Run `pnpm exec playwright test e2e/responsive.spec.ts e2e/ui-sweep.spec.ts`.
3. For iOS behavior, `e2e/touch-flow.spec.ts` drives the real flow with taps. With WebKit installed
   (`playwright install webkit`), `AETHER_WEBKIT=1 pnpm exec playwright test --project=webkit-iphone` runs it and the
   responsive spec in WebKit, the engine of every iOS browser. Added to the home screen the app opens full screen.
4. Look at the screens before committing.
