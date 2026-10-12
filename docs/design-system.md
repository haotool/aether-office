# Design system

The web UI is built in three layers: **tokens → components → features**. The rules below are checked by
`pnpm lint` (design tokens), `e2e/ui/responsive.spec.ts` (every page at 320, 390, 820, 1194, 1280 and 1366 px, and a phone
on its side) and `e2e/ui/ui-sweep.spec.ts` (axe accessibility, both themes). A UI change is done when those pass and the
changed pages have been looked at on a phone-sized and a tablet-sized screen.

**Contents.**
Foundations: [Tokens](#tokens) · [Stylesheet organization](#stylesheet-organization) · [Components](#components) ·
[Responsive and touch rules](#responsive-and-touch-rules) (with [Breakpoints](#breakpoints), [Preference queries](#preference-queries) and [the token lint](#the-strict-token-lint-and-its-baseline)) · [Navigation and phone information architecture](#navigation-and-phone-information-architecture) ·
[Settings](#settings).
The session panel: [Session panel](#session-panel) · [Squads in the panel](#squads-in-the-panel) ·
[Conversation rendering](#conversation-rendering) · [Text pipeline](#text-pipeline) · [Name tags](#name-tags) ·
[Clock out](#clock-out) · [Avatars](#avatars) · [KPI dashboards](#kpi-dashboards).
The 3D office: [The 3D scene on a phone](#the-3d-scene-on-a-phone) · [The camera runs itself](#the-camera-runs-itself) ·
[The beanstalk](#the-beanstalk) · [Many busy members at once](#many-busy-members-at-once) ·
[Desk screens and behavior](#desk-screens-and-behavior) · [Context window, compaction and provider marks](#context-window-compaction-and-provider-marks) ·
[Interactions with the characters](#interactions-with-the-characters) · [Alive and futuristic, cheaply](#alive-and-futuristic-cheaply) ·
[Squads in the scene](#squads-in-the-scene).
Delivery: [Loading performance](#loading-performance) · [Installable app (PWA)](#installable-app-pwa) ·
[Performance and quality tiers](#performance-and-quality-tiers) · [Verifying a UI change](#verifying-a-ui-change).

## Tokens

`apps/web/src/styles/core/tokens.css` is the **only** file allowed to hold a raw color, type size, space, radius or z-index.
`scripts/check-design-tokens.mjs` (part of `pnpm lint`) fails on a raw value anywhere else in the stylesheet.

| Family     | Tokens                                                                 | Notes                                                                                   |
| ---------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Spacing    | `--space-2` … `--space-64`                                             | 4px grid with 2px and 6px half steps; used by `padding`, `margin` and `gap`             |
| Radius     | `--r-xs` … `--r-3xl`, `--r-pill`                                       | A circle is `50%`                                                                       |
| Type       | `--fs-label` (11), `--fs-small` (12), `--fs-meta` (13), `--fs-body` (14), `--fs-lead` … `--fs-hero` | No visible text under 11px; readable text is 12px or more. Roles: 11 uppercase mono tags, 12 secondary and dense text (most of the UI), 13 the page's base text (`body`), 14 `h3`, row titles and conversation text |
| Line height | `--lh-tight` (1.25), `--lh-snug` (1.45), `--lh-body` (1.6) | A title or single line; text in a card; long reading text (`body` is `--lh-body`) |
| Elevation  | `--shadow-sm` / `-md` / `-lg`, `--shadow`                              | A raised chip or toast; a card or menu; a dialog (`.modal`)                             |
| Motion     | `--dur-fast` (0.15s), `--dur` (0.2s), `--dur-slow` (0.4s), `--ease`     | Loops and one-shots by role: `--dur-pulse`, `--dur-hold`, `--dur-sheen`, `--dur-caret` …  |
| Radius roles | `--r-control` (4), `--r-card` (8), `--r-sheet` (16), `--r-pill`       | Aliases of the scale above, so a role can change in one place                           |
| Layers     | `--z-*`                                                                | Named, ordered layers: scene overlays below page chrome, sheets on top                  |
| Color      | theme tokens (`--bg`, `--surface`, `--text`, …) and `--glass*`, `--on-glass*` | The glass set is for what is drawn over the 3D scene, a night view in both themes |
| Touch      | `--target-touch` (44px hit), `--control-touch` (40), `--control-touch-sm` (36), `--target-fine` (32), `--safe-*` | Hit area, older drawn sizes and the notch and home-bar insets; new code uses the control scale below |
| Controls   | `--control-h-sm` / `-md` / `-lg`, `--bar-h` (56), `--tabbar-h`          | See the control scale below                                                             |
| Frame      | `--sidebar-w`, `--brand-w`, `--team-chip-w`, `--stage-min-h`, `--stage-inset`, `--stage-rail` | The page frame and the desktop stage's insets; the steps by window size are at the end of `tokens.css` |
| Focus      | `--focus-ring` (2px mint), `--focus-offset` (2px)                       | One look for every focused control (below)                                              |

### Control scale

Every button, field, select, icon button, chip and segment takes its height from one of three tokens. The touch values
replace the mouse values in one place, a `@media (pointer: coarse), (max-width: 760px)` block at the end of `tokens.css`; a
rule never re-declares a height for a finger. `touch-targets.css` only extends the hit area to 44px (an invisible `::before`).
The 3D scene's toolbar (`.segmented`, `.scene-options` in `office.css`) is a compact HUD over the canvas: its segments, buttons and
select are `--control-h-sm` (32 with a mouse, 36 with a finger), checked by `e2e/scene/scene-hud-consistency.spec.ts`. The HUD plaques
(floor card, deck panel, camera wall) are geometry: their insets come from the `--stage-*` tokens, their widths stay literal, each with a comment saying why.

| Token              | Mouse | Touch / phone | Used by                                                 |
| ------------------ | ----- | ------------- | ------------------------------------------------------- |
| `--control-h-sm`   | 32    | 36            | icon button, text button, chip, segment                 |
| `--control-h-md`   | 36    | 40            | button, field, select, summary                          |
| `--control-h-lg`   | 40    | 44            | a main call to action                                   |
| `--bar-h`          | 56    | 56            | top bar, tab bar, drawer header                         |

The heights are minimums: a label that wraps grows the control. `e2e/ui/role-variance.spec.ts` measures the 14 views at
1440x900, 390x844 and 820x1180 and fails when a role shows more distinct heights than it should (buttons 3, icon buttons 1,
fields 2, chips 2, segments 1). Chrome that a later track of the UI consistency work owns is excluded there by name.

### Focus ring

`base.css` has one `:focus-visible` rule: `outline: var(--focus-ring)` at `--focus-offset`. A rule that must differ (an
inset row, a drag handle) sets its own offset and keeps the same ring; it does not pick another color or width.

### Shared classes

The `u-` classes are the shared names (`controls.css`, `forms.css`, `pages.css`); the older classes join them through grouped
selectors, so nothing had to be renamed at once. `.u-chip`, `.u-card`, `.u-head` with
`.u-head__actions` (alias `.page-heading`; the title on one side, any number of actions wrapping on the other), `.u-empty`
(what `Empty` renders), `.u-switch` and `.u-segmented` (alias `.view-switch`). The Settings switch (`.switch u-switch`) and
segmented control (`.sseg u-segmented`) and the KPI dashboard's header (`.kpi-head u-head`) and office chips (`.u-chip`) use
them and keep only their own geometry (the switch track, the segmented's joined frame). The section headings of the panels and
the other empty states still have their own classes; they move to these as their files are converted. `.kpi-empty` and
`.kpi-note` are one-line notes, not empty states, and stay as they are.

## Stylesheet organization

`apps/web/src/styles/index.css` loads the files in cascade order: tokens, base, shell, office, session panel, controls,
pages, forms, views, login, the desktop breakpoints, the feature files (scene HUD, telemetry, transcript, git, sessions,
quick open) and finally the touch and phone layers (`touch-targets`, `compact-desktop`, `phone-drawer`, `phone-office`
with its `-scene` and `-fit` continuations, `phone-sheet`, `phone-pages`, `phone-density`). A rule goes in the file of the thing it styles, never in a catch-all. The KPI styles are two files: `kpi.css`
(strip, dashboard, tiles, phone) and `kpi-charts.css` (the token bar, daily bars, rings, shares, the deck line and the floor plaque).
The file list is documented at the top of `index.css`.

## Components

Shared pieces live in `apps/web/src/ui/` (one module each: `Modal.tsx` holds `Modal` and `Sheet`, `Disclosure.tsx` holds `Fold`, `Hint` and `Clamp`, then `Field.tsx`, `Badge.tsx`, `Empty.tsx`, `PageHeading.tsx`, `whyNot.ts`, `useT.ts`): `Modal`, `Sheet`, `Fold`, `Hint`, `Clamp`, `Field`, `Badge`, `Empty`,
`PageHeading`. A feature composes them instead of rebuilding a portal, a backdrop or a close button. Buttons are the
classes `primary`, `secondary`, `icon-button` and `text-button`; a new variant is added beside them in `controls.css`.

A control that is off says why: `{...whyNot(t, [canWrite, 'needOperator'], [!busy, 'whyBusy'])}` (`ui/whyNot.ts`) sets the first unmet
reason as the control's `title` and as its `aria-describedby`, which names the text `ReasonDefs` (mounted once, in the application and
on the login page) keeps in the page. A new reason is a locale key (both languages) added to `REASONS`. `e2e/settings/disabled-reasons.spec.ts`
walks the main pages as the owner and as a viewer and fails on a disabled control with no description.

## Responsive and touch rules

1. **Width.** A phone is `<= 760px` or a phone on its side (`pointer: coarse` and `max-height: 500px`). There, navigation
   is a drawer and the session panel a bottom sheet. Nothing scrolls the page sideways. A table that is wide on purpose scrolls
   inside `.table-scroll`; a table of rows becomes cards on a phone (`table.stack`, with a `data-label` on every cell).
2. **Type.** The page's base text is 13px (`--fs-meta`); secondary and dense text is 12px, tags 11px, titles and conversation
   text 14px (see the Type row). Form fields are 16px on a phone (iOS zooms the page on anything smaller).
3. **Targets.** With a finger a control is drawn 36px (icons, segments, chips) or 40px (buttons, fields) and is hit at 44×44: an
   invisible area reaches past its edges (`touch-targets.css`), and a checkbox is reached through its row. The responsive spec
   enforces the drawn size (36); with a mouse at least 32 (`--control-h-sm`).
   Overlays that duplicate another way to do the same thing (the name tags on the 3D scene) are exempt. Hover styles live
   under `@media (hover: hover)` so a tap does not leave a control looking hovered, and controls set
   `touch-action: manipulation`.
4. **Screen.** Use `100dvh`, never `100vh`, and take padding from `--safe-*`.
5. **Cut off.** Nothing is clipped by an ancestor that does not scroll. A short screen (an iPad on its side) still reaches
   the last link and the sign-out button, and a label never wraps letter by letter.
6. **Plain HTTP.** A phone reaching the server over the LAN has no secure context: no `crypto.randomUUID`,
   `navigator.clipboard` or service worker without a fallback (`browser-compat.ts`).

### Breakpoints

A `@media` query uses px only at four values: **760, 1000 and 1250 for width** and **500 for height** (a `min-width` partner
is one above, for example 761 or 1251). `760` is the phone, `1000` the tablet, `1250` the compact desktop; the height `500`
is a phone on its side. A component that must change by the room it has, not by the window, uses a container query
(`@container`, as the session panel, the settings page, the phone's top row, the task list and the member bar do), which the
lint does not count. Four thresholds are measured facts about one component and are listed, with their reasons, in
`MEDIA_EXCEPTIONS` in `scripts/design-token-rules.mjs`:

| px   | Where                                                                                                     |
| ---- | --------------------------------------------------------------------------------------------------------- |
| 700h | a short phone (an SE is 667px tall): the floor rail stands on the new-task button instead of the middle    |
| 880h | the scene shell keeps the control-room wall its minimum height on a roomy window                          |
| 1500 | the top bar holds the telemetry numbers only above the width where brand, picker, numbers and controls fit |
| 1800 | an ultra-wide window: a wider sidebar and page padding                                                    |

The top bar keeps every control on screen at 320, 390, 768, 1024, 1440 and 1920px (`e2e/ui/role-variance.spec.ts`, native
runner): its right side never shrinks, the project picker gives way first, below 1000px the emergency stop shows its icon and
the decorative initial goes, and below 760px the link state is its dot.

### Preference queries

What the person's system asks for is answered at the end of `breakpoints.css` (and `tokens.css` for the colors), and checked
with Playwright's media emulation in `e2e/settings/preferences.spec.ts`, which also saves screenshots to `evidence/preferences/`:

- `forced-colors: active`: the system paints the colors, so shape must say what color said. Every button, chip, tab and bar
  gets a 1px `ButtonText` or `CanvasText` border, the `.primary` cut corner goes, a selected control (`.selected`, `.active`,
  `aria-pressed`, `aria-current`) is outlined with `Highlight`, and the focus ring is a 3px `Highlight` outline.
- `prefers-contrast: more`: `--line`, `--muted`, `--dim` and the glass lines are one step closer to the text color in both
  themes and the focus ring is 3px.
- `prefers-reduced-transparency: reduce` (and `prefers-contrast: more`): the glass tokens are opaque.
- `prefers-reduced-motion: reduce`: no transitions, animations or smooth scrolling.

A preference outranks every component rule, so these blocks may use `!important`; each such line carries the escape hatch
`/* token-lint: preference */`.

### The strict token lint and its baseline

`scripts/check-design-tokens.mjs` (part of `pnpm lint`) has two parts. The first is absolute: a raw color, font size,
spacing, radius or z-index outside `tokens.css` fails. The second holds the rules of `scripts/design-token-rules.mjs` to
`scripts/design-token-baseline.json`, which records the count per rule and per file; **a count may only go down**, and the
gate prints the rule and the file that rose.

| Rule                      | Counted                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `literal-size`            | a `px` of 2 or more in `width`, `height`, `min-`/`max-` of those, `inset`, `top`, `left`, `right`, `bottom` |
| `viewport-height`         | a `vh` unit (use `dvh` or `svh`)                                                               |
| `media-breakpoint`        | an `@media` px value off the scale above and not in `MEDIA_EXCEPTIONS`                         |
| `custom-property-literal` | a `--x: 12px` outside `tokens.css`                                                             |
| `literal-duration`        | seconds or milliseconds in `transition` or `animation` (use `--dur-fast`, `--dur`, `--dur-slow`, or a loop or one-shot role such as `--dur-pulse`, `--dur-hold`) |
| `literal-shadow`          | a px value in `box-shadow` or `text-shadow` (use `--shadow-sm/md/lg/up`, `--ring`, `--glow-*`)         |
| `literal-line-height`     | a `line-height` that is not `var(--lh-*)`, `inherit` or `normal`                               |
| `important`               | `!important`                                                                                   |

`0`, `1px` hairlines, `%`, `auto` and a size from a token pass. **The escape hatch** is a comment on the declaration's own
line, `/* token-lint: <reason> */`, and exempts that line: `geometry` (the size of a dot, a drawing, a plaque over the 3D
scene or a panel's measure, never a control or bar height, which come from `--control-h-*`, `--bar-h`, `--target-touch`) and
`preference`, and a one-off ring, glow, shadow, loop or entrance with no sibling to share a token with (`ring`, `glow`,
`shadow`, `loop`, `animation`, `glyph` reasons). A dot or a small icon takes a `--space-*` step for both sides, a hairline bar `--bar` and a larger icon `--icon-md` or `--icon-xl`; a ring, glow or edge highlight takes `--ring-inset`,
`--glow-*` or `--edge-top` (the geometry only; the color is the call site's); an endless or one-off animation takes a `--dur-*`
role (`--dur-pulse`, `--dur-breathe`, `--dur-hold`...); a single-line glyph takes `--lh-none`. The
`escape-comments` rule of the scorecard budgets the hatch at 100 lines: a growing pile means values are being hidden
rather than tokenised. The reason is for the reader; a new hatch is a
review decision (`grep -r "token-lint:"` lists them all). `node scripts/check-design-tokens.mjs --list` prints every counted
violation and `--update` lowers the baseline to today's counts (it refuses to raise it). The quality scorecard
(`pnpm run quality -- --area ui`) reads the same rules and baseline, and `e2e/ui/role-variance.spec.ts` writes
`evidence/role-variance.json` for it. The rules are unit-tested with CSS they allow and CSS they reject in
`tests/aether/design-token-lint.test.ts`.

### One role, one height, and the finger

`e2e/ui/role-variance.spec.ts` measures buttons, icon buttons, inputs, chips, segmented controls, tab bar items and drawer rows on
the 14 views, the 3D office and the open drawer at desktop, phone and tablet, and nothing is excluded: the scene toolbar, the
session panel and sheet, the composer, the squad, quick open, the tab bar and the drawer count like any page. A second check holds the
44px hit area: on a phone and a tablet every button, link, summary and tab drawn smaller than 44px must still receive a touch at
its 44px edge (the `::before` area of `touch-targets.css` and `compact-desktop.css`). A control with a `clip-path` (the `.primary`
cut corner) cannot extend a hit area, so it is the 44px itself on touch.

## The 3D scene on a phone

- The scene works by touch and fits a portrait screen (`fittedOffset`). On a phone it _is_ the page: it fills the screen
  between a slim top bar and the tab bar, with no heading, stats or panels over it. Only a floor rail, a few round buttons,
  two chips (Running, Needs you) and, for the member in hand, one slim bar are drawn over it. Names are hidden until asked for. The 2D list is
  always one tap away.
- **Animation rule.** An infinite or long animation animates only `transform`/`translate`/`opacity`, never
  `background-position`, `box-shadow`, `filter` or a box size: those repaint every frame (and a `color-mix` shadow also
  recalculates style). Move a band across a clipped pseudo-element, fade a glow pseudo-element. Remaining repainting
  exceptions are listed in the changelog (the thinking line's text shimmer needs `background-clip: text`; loading skeletons run
  for seconds; the desktop-only floor plaque scan).
- **No backdrop blur.** No surface uses `backdrop-filter` or `filter: blur`: a blur behind a surface re-runs whenever what
  lies behind it changes, and the live canvas changes every frame. The glass tokens (`--glass*`) are near-opaque tints
  instead (88% to 96%), the same on a phone and on a desktop. The saving is expected on phone GPUs and Safari and is
  unverified on a real device (a desktop GPU shows no difference within noise).
- Rendering is lighter on a phone: no shadows, no antialiasing, pixel ratio ≤ 1.5 (2 on the high tier, not yet tried on a real phone), smaller models, about 20 frames a
  second when idle, and no rim light.
- Dialogs and sheets put what you act on first and fold the explanations (`Fold`, `Hint`, `Clamp`). Sheets stand on the
  lower half of the screen (56dvh; the session sheet is described below) and render into `document.body`.
- **The camera runs itself.** The director (`packages/office-scene/src/environment/director.ts`, `shot-camera.ts`) cuts to who is
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
  resume, copy fork). A waiting session says that approval happens in the terminal, unless Remote approvals is on and the hook
  reported the prompt: then the feed row carries the approval card instead (see [security](security.md#safety-properties)). When the server finds the session's
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
  The model chip and the quick replies are `u-chip`; Send and the box are `--control-h-md` (`e2e/ui/panel-consistency.spec.ts`).
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
  of the window, a drag within 8px of the default settles on it, and the default follows the window (440px
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
  and groups that fold smoothly; an empty feed says how to start a session. Conversation: 14px body text, the assistant as plain
  text and the person's words in a bubble, timestamps on hover (always on a touch screen), code blocks with the language and a copy button, `diff` blocks
  coloured by +/-, tool calls as slim chips with a shimmer and the time taken (ticking while they run), a "jump to latest"
  pill after a screen of scrolling up, skeleton rows while the first fetch is out. Composer: the box grows from one to eight
  lines, the quick-reply chips scroll sideways, and the slash and @ lists carry their key hints. A permission card shows the time
  left as a thin line along its top edge. Motion uses `--dur-fast`, `--dur` and `--ease` only.
- **Server.** `GET /api/local-sessions/:key/transcript` returns up to 120 entries, each with the provider's tool id (`toolId`,
  also on its result) and a short redacted target (`summary`: a path, a command). Nothing else about the transcript's safety
  changed: key lookup only, bounded tail read, no hidden reasoning, redacted and cut.

### Squads in the panel

A session that has subagents is a squad, and the panel makes the relation plain without the 3D scene: on a phone, in calm mode
and for a screen reader. The data is what the scene already draws (`session.subagents`, `squadsOf` and
`officeModel().liveSquads` in `office-model.ts`); nothing is derived twice. Pure rules: `feed-squads.ts` (rows, order, grace,
accent, elapsed text, announcements), `squad-open.ts` (the fold choice), `squad-text.ts` (the words), `tree-nav.ts` (the keys).
Components: `FeedRow.tsx`, `FeedSquad.tsx`, `SquadStrip.tsx`, `SubagentCards.tsx`, `SubagentView.tsx`, `HookNote.tsx`,
`SquadAnnouncer.tsx`; styles `squad.css`; words `locales/squad-en.ts` and `squad-zh.ts`. Tests: `squad-feed.test.ts`,
`e2e/office-life/squad-panel.spec.ts`, `e2e/office-life/squad-panel-states.spec.ts`.

- **A subagent is never a feed row.** `groupFeed(feed, now)` attaches each supervisor's `squad` to its row. A squad is a
  `role="tree"` named "Squad of {name}": the supervisor row is the level 1 `treeitem` (`aria-expanded`), each subagent a level 2
  `treeitem` with `aria-posinset` and `aria-setsize`. One item is the tab stop (roving `tabindex`); Up and Down, Home and End
  move, Right opens or enters, Left folds or goes to the parent, Enter opens (`tree-nav.ts` decides). The chevron is for a
  pointer only (`tabindex="-1"`, hidden from assistive tech), because the keys cover it.
- **The supervisor row** gets a squad chip: "3 subagents · 2 working", plus "1 waiting for approval" when one waits and "all
  finished" when none runs. The chip is outlined in the squad's accent.
- **A nested row** is indented under the supervisor on a rail and a tick in the squad's accent: a status dot (running pulses,
  waiting for approval is amber, finished is blue, unknown is dim), the type (and the nickname Codex gave it), how long it has run
  (one shared one-second timer, only while a row runs; hidden from assistive tech because it only counts up), and what the source
  knows: the tool count (not shown where the source does not count, a Codex child), the last tool, and a task label or result
  only when the server sent sanitized text (`label` and `result`, read through `toPlainPreview`, 160 characters at most).
  A row is at least 44px high. Pressing a running subagent opens its own view; a finished one has left the office, so it opens
  its supervisor, which holds its card.
- **Order.** Within a squad: waiting for approval first, then running in spawn order (stable, it never jumps as work happens),
  then finished by when they ended. Among supervisors: the feed's groups are unchanged, and inside a group a supervisor with a
  subagent waiting for approval comes first, then the newest.
- **The grace.** The server keeps a finished subagent for 90 seconds (`FINISHED_GRACE_MS`); the panel shows it for the same
  time, dimmed in color (never by opacity, so the text keeps its contrast), and from 60 seconds on its rail and dot fade.
- **Fold.** A squad of more than three subagents starts folded, unless one waits for approval (that opens it). A person's
  choice is kept per supervisor in this browser (`aether.squadOpen`, at most 100 choices) and wins over the default.
- **Accent.** Each supervisor key maps to one of six accents derived from the theme tokens (mint, blue, violet, two blends, the
  provider orange), stable for as long as the session lives. The supervisor's and its subagents' portraits are edged in it and a
  subagent's carries a small tether glyph (`Avatar`: `squadHue`, `tether`), in the feed, the team strip and the conversation
  header. 3D name tags are the scene's and are not changed here.
- **Conversation of a supervisor.** A **Squad strip** under the header lists the live subagents as chips (status dot and name; at
  most eight, then "+N"). A chip scrolls to that subagent's card under the transcript and opens it; the transcript itself stays
  first and unfolded. **Subagent activity** is a card per spawn: type, status, tool count, duration; opened it lists start,
  duration, tool calls, last tool, the task and result when sent, and the subagent's own recent calls (`hook.recent` entries
  whose `agentId` is its id; the transcript itself carries no agent id, so it is not filtered).
- **A subagent's own view.** It has no transcript of its own, so selecting one shows a "Spawned by {supervisor}" chip (it
  selects the supervisor), the same facts and its recent calls, and a foot that says it cannot be written to.
- **Edge states.** A Claude session that works without hooks may have a squad nobody can see: a note says Claude subagents need
  the hook and offers `pnpm hooks install --project <dir>` with a copy button (it shows only while the session works and has no
  squad; Codex needs no hook, its helpers are separate rollouts and carry a name and a state, no tool count). A squad whose
  members all finished reads "all finished" and goes when the grace ends.
- **Live region.** One polite `role="status"` in the feed says "2 subagents started, 1 subagent finished": what was already
  there on opening is not announced, and changes are gathered for four seconds so a burst of thirty is one sentence.
- **Performance.** A folded squad renders only its header. Rows are memoized with a field-by-field comparison, so an event that
  brings the same facts redraws nothing, and the handler they receive is stable. A 30-subagent squad toggles in one frame.

### Conversation rendering

Agents write Markdown; a person must never see its syntax where it is not rendered. One pure module owns it:
`packages/kernel/src/markdown-*.ts` (blocks, inline runs, `toPlainPreview`, `toInlineSegments`, `cutMarkdown`, word helpers),
used by the scene (no `apps/*` import) and the web app alike. Tests: `markdown-blocks`, `markdown-preview`, `session-speech`.

- **Where each place gets its text.** Conversation: `Markdown.tsx` renders the blocks as elements (headings, nested, numbered
  and task lists, tables, quotes, rules, fences with language, bold, italic, strike, code, links, images as alt text; never
  `dangerouslySetInnerHTML`; a link is kept only for `http(s)` and opens with `rel="noopener noreferrer"`, `javascript:` and
  the like are plain text; no image is fetched; single line breaks stay line breaks, so Chinese lines are not joined by a
  space). Speech bubbles: `toInlineSegments` runs rendered as bold, code chips, bullets and small-label headings. Feed row
  reply, phone peek line and member bar: `toPlainPreview` (`feed-model.ts`). Session titles (Claude `ai-title`, Codex
  thread name, a task's opening words) and notification bodies (`alert-rules.ts`): `toPlainPreview` too. The speech endpoint
  cuts a reply with `cutMarkdown` after redaction, so no fence, code span, `**`, `~~`, link or half table is left open.
  Hover card, desk monitor and PiP captions only ever show names, roles, tools and these titles.
- **Bubble.** Glass with a neon edge in the member's department color, a faint scanline and a tail; five lines for a reply,
  two for a prompt, then the text scrolls by itself (`use-speech.ts`: 30px/s, 1.2s pause at each end, two passes, then it stays
  at the end; one requestAnimationFrame loop per overflowing bubble, no React render). Hovering holds it and shows more of it;
  with reduced motion it never scrolls and is a clamped preview with a fade, expanding on hover. A changed reply types out
  word by word (`Intl.Segmenter`, so Chinese and English alike) with a blinking caret; a new bubble springs in, an old one dims.
  Close up, a bubble slides down to stay whole instead of vanishing off the top.
- **Conversation.** A reply that arrives while the panel is open fades in word by word and enters with an 8px rise in 160ms;
  what was there at the first look never animates (`use-fresh-ids.ts`). The view glides to a new message while you are at
  the bottom, and otherwise offers the "N new" / jump pill. A working session ends with a shimmering "Working · 12s" line
  (unless a tool chip is already running). Every assistant message but the newest folds behind "Show more", with a fade, when it is tall
  (`LongText.tsx`).
- **Conversation tools.** Notices are slim chips between messages (`NoticeChips.tsx`, `transcript-notices.css`; icons are
  inline SVG, color from tokens, mono for commands). Code blocks (`CodeBlock.tsx`) have a language label, a wrap switch, a
  copy button, a gutter of line numbers past eight lines (CSS counters, so a selection never copies them) and scroll
  sideways; tables scroll inside their frame. Times read "just now" and "3 min ago" for the first hour, then the clock; a
  day line (Today, Yesterday, a date) separates days; "New since you looked" marks the first thing after the time the person
  last opened the session (`seenBaseline`, taken before opening marks it seen). Hovering a message shows copy as Markdown and
  as plain text; on a touch screen, tapping the message does. With focus inside the conversation: `j` and `k` move between
  turns, `g g` and `G` go to the ends, and Ctrl or Cmd+F opens its own find over the loaded messages, painted with the CSS
  Custom Highlight API (no DOM change; where the API is missing the browser's find is not intercepted). A compact density
  toggle is kept in this browser. Rows are memoized (`reuseTurns` keeps unchanged turns identical across polls, `Markdown`
  parses once per text); the transcript holds at most 120 entries (about 950 DOM nodes measured on a 20-turn run), so the turns
  are not windowed.
- **Adopted from Happy** (`happy-app/sources/components/markdown/*`, `ShimmerText`): its own
  small parser rather than a library (block types text, header, list, numbered list, code, table, rule; unfinished `**` and
  backtick spans degrade to styled text, not markers; links only `http(s)`), the autolink trailing-punctuation trimming, the
  shimmer for "thinking", tool runs folded into one chip, and the idea that the newest message is the one fixed reference of a
  chat. **Orca's** native chat previews a message as whitespace-collapsed prose (`nativeChatUserMessagePreview`), which is the
  rule of `toPlainPreview`.
- **Skipped, and why.** Mermaid (no diagrams, no remote fetch), an inverted virtual list (it exists for React Native recycling
  and cannot expand a block in place, which Happy documents as unsolved; the transcript is at most 120 entries), per-token
  streaming (transcripts arrive as whole messages, so words are revealed rather than tokens), and Happy's 16px chat type (the
  panel is 14px by the type scale).

### Text pipeline

Text enters the product at a few sources and is consumed in many places. Two principles: **sanitize once at the boundary**
on the server into a small set of trusted types (plain title, plain preview, Markdown body with its HTML neutralized, tool
target), and **render at the edge** with typed renderers; a consumer never re-derives meaning with an ad-hoc regex. The
code is `packages/kernel/src/text-*.ts` (no `apps/*` imports): `neutralizeHtml`, `stripCliWrappers`, `cleanTitle`,
`shortLabel`, `displayWidth`, `balanceBrackets`. Tests: `text-html` (86 table cases plus properties), `text-title`,
`session-transcript`, `session-title`, `session-speech`, `session-names`, and `e2e/session/text-pipeline.spec.ts`.

| Source | Where it is read | Sanitized by |
| --- | --- | --- |
| Assistant and user messages (Claude, Codex) | `session-transcript.ts`, `session-speech.ts` | `stripCliWrappers` then `neutralizeHtml`, redacted, cut |
| Tool calls and results, tool target (`summary`) | `session-transcript.ts`, `session-work.ts`, `hook-spool.ts` | Redacted and cut; shown only as text (React escapes), never as Markdown or HTML |
| A subagent's task description and last words | `subagent-files.ts`, `subagent-transcripts.ts` (through `subagent-text.ts`) | Redacted first, then `stripCliWrappers`, `neutralizeHtml`, `toPlainPreview`, cut to 60 / 160 characters; plain text only |
| Claude `ai-title`, Codex thread name | `session-title.ts` | `cleanTitle` |
| A task's opening words (a `codex exec` title) | `session-topic.ts` | `cleanTitle`, redacted |
| Commit subjects and authors, terminal output | the repository and terminal services | Text only; never rendered as Markdown |

| Sink | Gets | Through |
| --- | --- | --- |
| Conversation | Markdown body | `Markdown.tsx` over `parseMarkdown`, which neutralizes HTML again (defence in depth) |
| Speech bubbles, feed reply, member bar, notifications | Plain or inline segments | `toInlineSegments`, `toPlainPreview` |
| Name tag, member list, PiP captions, team chips | Short label (28 columns) | `shortLabel` via `labelOf` in `session-names.ts`; the full title is the tooltip and accessible name |
| Feed rows, live and attention lists | Row label (44 columns) | `rowLabelOf`; the full title is the `title` attribute |
| Panel header, sessions list, search | Full clean title | `cleanTitle` on the server; the web normalizes an older server's title in `local-session-compat.ts` |
| Desk screen header | Short label (40 columns) | `shortLabel` in `screensOf`, then the canvas's own pixel fit |
| Document title, history pages | No session text | nothing to sanitize |

Rules. `neutralizeHtml` turns HTML in prose into Markdown or text (`<br>` a newline; `<p>`, `<div>`, `<span>` wrappers dropped
with their text kept; `<a href>` a Markdown link only for http(s); `<code>` inline code; `<pre>` a fence; `<b>`, `<i>`,
`<s>` emphasis; lists; `<table>` a Markdown table; `<details><summary>` a heading and its body; `<img>` its alt text;
comments, `<script>` and `<style>` dropped with their content; entities decoded once, `&lt;` becoming an escaped `\<`).
A tag counts only when its name is on the known list and its syntax is well formed, so `Array<string>`, `Map<K, V>`, `a < b`
and `x<y>z` stay text, and code spans and fences are never touched. CLI wrappers are decided per tag: `<system-reminder>`,
`<thinking>`, memory citations and the local-command caveat are dropped; the rest become typed notices (below);
`<command-name>` is the command as typed (`/compact`) wherever there is no room for a notice (a title, a bubble). A title is a label: control, zero-width and bidi characters
removed, markup and entities gone, surrounding quotes and bullets stripped, whitespace collapsed, at most about 120
characters. `shortLabel` drops the `cx·01a1` id prefix and a leading repo name, counts CJK and emoji as two columns, cuts on
a meaning boundary (sentence or clause punctuation, a space, outside brackets first), never inside a grapheme, and never
leaves an opening bracket unmatched: a group that opens the label is closed, anywhere else the dangling part is dropped.
Both are idempotent.

#### Wrappers and notices

The CLIs and models leave XML-style wrappers in text that nothing lists in advance (`<task-notification>` with its `<task-id>`,
`<tool-use-id>`, `<output-file>`, `<status>`, `<summary>`; `<system-reminder>`, `<command-stdout>`, `<function_results>`,
`antml:*`, `<ide_opened_file>`, `<turn_aborted>`, a stray `</div>`). A count of the tag names in real transcripts (outside code,
user and assistant text) showed the long tail: `option`, `root`, `entry`, `environment_context` and its children (`cwd`,
`shell`, `current_date`, `timezone`), `summary`, `task-id`, `task-notification`, `status`, `output-file`, `tool-use-id`,
`oai-mem-citation`, `usage`, `result`, `subagent_notification`, `system-reminder`, `turn_aborted`, `command-name`. So the rule is
structural, not a list (`text-tags.ts`). Outside code spans and fences, a tag whose name is `[A-Za-z][\w:.-]*` is a wrapper
when:

- it is a **closing tag**: balanced with an opener or stray, it never reaches the screen (`</task-notification>`, `</div>`);
- or it **opens a balanced pair** (the same name closes later in the text);
- or its name holds `-`, `_` or `:` and it stands at the start or end of a line, has attributes or is self-closing.

It is **text** when it is an inline generic (no attributes, directly after an identifier character, no closing counterpart:
`Array<string>`, `a<b>c`, `Promise<void>`), when it is a placeholder in a sentence (`use <your-key> now`), or when it is in
code. Removing a wrapper keeps its inner text, with a space where two words would otherwise touch and no double space. A stray
block closer (`</div>` with no `<div>`) breaks nothing. Work is linear: one forward pass, a block is skipped once read, and
emphasis and link nesting is capped, checked by a 1 MB hostile-input test (`text-wrappers.test.ts`: 93 table cases, the notices, idempotence and 1 MB perf).

`structureWrappers(text)` (`text-wrappers.ts`) returns `{ text, notices }`. Wrappers that carry meaning become **notices**;
ids, tool-use ids and output paths are never kept:

| Wrapper | Notice |
| --- | --- |
| `<task-notification>` (`<subagent_notification>`) | `task`: status, summary, exit code read from the summary, optional result detail |
| `<command-name>`, `<command-args>` | `command`: name and arguments (`<command-message>` dropped) |
| `<local-command-stdout/stderr>` | `output`: text without terminal colors, `error` for stderr |
| `<system-reminder>`, `<environment_context>`, `<ide_*>`, `<user_instructions>`, `<permissions>`, `<skill>`, `<plugin>`, ... | `context`: label and sanitized text, leaf children as `cwd: /x` lines |
| `<*-hook>` (user-prompt-submit and the like) | `hook` |
| `<turn_aborted>`, `[Request interrupted by user]` | `interrupted` |
| thinking, memory citations, the local-command caveat | dropped |
| anything else | tags removed, inner text kept |

The server (`session-transcript.ts`) turns each notice into its own entry (`role: 'notice'`, `notice: {...}`), redacted and cut
like a message; the conversation draws it as a chip. A task chip is green only for a completed status with exit code 0 and red
for a failed or killed status or a non-zero code; every other notice is neutral. Injected context of one place is **one** chip
("Context added · 3 items") that opens into the sanitized text, so it can be inspected and is never shown as tags.
`tests/aether/text-sinks.test.ts` fails when a component starts printing a session-text field (`title`, `summary`, `reply`, ...)
that is not classified in `text-sinks.allowlist.json`.

### Name tags

A name tag is a small glass chip (`NameTag.tsx`, `name-tag.css`): the provider's mark, a status dot that glows in the state's
colour (`--scene-*` tokens, light on the scene's dark glass in both themes) and the short label, edged in the member's
department colour. Working shimmers teal, waiting for a person pulses amber, an error is red, idle is calm, offline is dim;
the unread mark is a gold dot. By camera distance (`data-density`, set each frame in `Labels.tsx`): beyond 85 units only the
mark and the dot, up to 30 the full chip. Hovered or selected, it opens into a card: repository, role, what it is doing and
the context share. The technical id (`cx·01a1`) is only in the tooltip, with the full title; the accessible name is the full
title, role and state. On touch the hit area grows to 44px with a pseudo-element, not with padding. Motion stops under
`prefers-reduced-motion` and the page's setting. A tag appears with a short fade and scale; it leaves without an
animation. The projection's overlap and bubble-avoidance logic is unchanged (a far tag only takes 44px of width).
The two repeating effects animate only compositor properties: the working band slides by `translate` on a pseudo-element
(clipped by the chip with `overflow: clip` under a fine pointer; on touch, where the 44px hit area hangs outside the chip, the
band breathes in `opacity` instead), and the amber glow of a tag waiting for a person is a pseudo-element whose `opacity`
fades. Measured on the phone profile with 12 tags forced into each state: 2,300+ paints in 8 s fell to under 10.

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

## The camera runs itself

Two things move the camera without a hand on it. The **director** cuts between members (one slow dolly per shot, a level
horizon, no zoom, a dip for a hard cut). The **intro tour** plays on a first visit (`packages/office-scene/src/intro`): a 360°
orbit of the stacked building (26 s, at most 16.4°/s), a cut under a 400 ms dip to the exploded view, a 15 s rise up the spire to
the crown, a 4 s hold and a cut back to the start view, 45.8 s in all. It follows the director's comfort rules; `introPoseAt` is
a pure function of time, and `tests/aether/intro-tour.test.ts` samples it for angular speed, level pitch, distance and the shell.

- **When.** Once per browser session, with the preference `intro: 'auto'`, never under browser automation (`?intro=force`
  overrides, for tests), after the scene is warm and frames run smoothly. On a phone it plays once ever (finishing it turns the
  preference off). Replay is in the floor panel and the phone's "more controls"; it ignores the gates.
- **Ending.** Any input (pointer, wheel, touch, a key, choosing a member) stops it where the camera is; the director returns
  after its usual quiet spell. Esc jumps to the closing cut and lands on the start view. "Don't show again" sets the preference
  to `'never'`. Hiding the page ends it quietly.
- **Reduced motion.** Three still views of 3 s each (start, exploded, crown), cut between, then the start view.
- **Caption.** A glass pill (`styles/scene-intro.css`, tokens only) with `role="status"`, a Skip button and "Don't show
  again", bottom left on a desktop and above the controls on a phone. The room tour (8 stops) is kept as "Guided tour (rooms)".

## The beanstalk

The 3D scene draws the repository as a braid of glass trees running up the building's axis, with a crown that history builds
above the roof (`packages/office-scene/src/core/stalk-layout.ts`, `crown-layout.ts`, `Beanstalk.tsx`, `Garden.tsx`, `Clouds.tsx`),
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
one a visibly different flower); `flower-petals.ts`, `flower-bloom.ts`, `flower-tree.ts` and `garden-geometry.ts` turn genomes into geometry;
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

- **Two tiers of pages** (`apps/web/src/lib/navigation/nav.ts`). The default navigation is the CLI-first set: the office, local sessions,
  approvals, terminals, history and settings. The pages for orchestrating several agents (tasks, review of results, team,
  knowledge, messages, execution hosts, observed sources, workspaces; and in Settings the schedules, A2A clients and
  integrations) appear only when **Advanced** is on (Settings, off by default, stored in the browser's preferences). It is a
  filter on the navigation, the tab bar and quick open, not a gate: their addresses always open. The Playwright suite starts
  with it on; `e2e/workbench/advanced.spec.ts` covers the default.
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

## Settings

First principles: a CLI user comes to sign in on a phone, turn notifications and remote approvals on, pick theme, language and
quality, see which models were found, connect a phone and flip Advanced; an owner configures execution (rare); a viewer reads.

- **Groups** (`features/settings/sections.ts`): General, Notifications & approvals, Connections, Models & execution, Office,
  Advanced, Data & privacy, About. Every setting is one entry in `entries.ts` (group, label key, description key, extra words in
  both languages); the page and the search read the same entry, so they cannot drift.
- **Shell sizes**: the top bar is `--bar-h`; its project select, the sign-out link and the user dot are `--control-h-sm`. A long
  project name ends in an ellipsis (the select's `title` holds the whole name). The active nav link draws its mark with an inset
  `box-shadow`, so the focus ring stays the token's. A search box draws one ring around the whole field (`:has(input:focus-visible)`).
- **Layout** is a container query on the page's own width, not the window's (the sidebar and session panel take theirs). From
  560px: a sticky column of links with a mark that follows the scroll (`useScrollSpy`), a link scrolls to its group and sets
  `/settings/<group>`. Under that: the same links as a row of tabs. A phone (portrait or on its side) shows the groups as large
  rows (44px and more); a group opens as its own page under a bar with Back (not sticky on a phone on its side). A row puts its
  control at the right when its group is 560px wide, below the text otherwise.
- **Kit** (`features/settings/kit.tsx`): `Row`, `Block` (a whole panel gated by search), `Switch` (a native checkbox with
  `role="switch"`, the label is `--control-h-sm` and the track 28px, hit at 44px), `Segmented` (radiogroup, arrow keys), `SelectBox`, `StatusChip` (word and mark, never
  colour alone), `CopyCommand` (monospace, scrolls inside its own box, announces "Copied"), `InlineHelp`, `DangerZone`,
  `Skeleton`, `ErrorLine`. A control is named by its row's label and described by its text; a locked row disables it and says why.
- **Honesty.** A row shows the real state (notification permission, whether answering is allowed on this connection, secure
  context, which CLI was read, whether local sessions are on). What the page cannot see is said so: whether the hook is installed
  is checked in a terminal (`pnpm hooks status`). There is no device or token list because the API has none.
- **Search**: `/` focuses the box; words must all match the label, description, group name or keywords, in either language; Escape
  clears. Rows only available with Advanced are skipped until it is on.
- **Changes** apply at once; Advanced and Remote approvals show a notice with Undo. Preferences stay in the browser's
  `aether-ui-preferences`; `theme` may now be `system` and a stored `dark` or `light` is unchanged.

## Many busy members at once

- **How hard a member works** is read from real signals (`apps/web/src/features/sessions/activity-rate.ts`): how often something changed
  in its session over the last minute, the CPU of its process tree, and how many subagents work for it, giving 0 to 3. It drives
  the typing speed (a flat-out member types at 2.2x), a stream of bars that scrolls over its screen, and at level 3 smoke and
  sparks over the desk and a faint shake. `?intensity=3` in the address previews it with stand-in data.
- **A department's screen** is titled for its department (BUILD, PIPELINE, CHECKS, ANALYSIS, BOARD) and keeps an abstract ambient
  column; the work on it is described under [Desk screens and behavior](#desk-screens-and-behavior).
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

## Desk screens and behavior

**The rule: real facts stay real, everything else is made up and never shown as a fact.** What comes from the session is
drawn as it is: file names (a tab, the title bar, the code's identifiers), the first words of a command, a host, the tool
that is running and for how long, how many subagent calls were made, the branch, commits ahead and behind, uncommitted
files, open ports, the context in use, the model, the state. Everything around those (the code in the editor, the output
under a command, the shape of a page, the chart in a notebook, a sticker on the desk) is generated, seeded by the member's id
and the real tool and file, and carries no claim: no pass or fail, no exit code, no numbers in a dashboard, no message
text. A made-up line may look like code or a build log; it never says how anything ended.

- **The view follows the work** (`screen-layout.ts`), in this order: the state (a member who is not working has a lock
  screen; one waiting for approval keeps its work behind a dialog that names the real tool and short target), then the kind of tool
  call in hand (Edit and Write are an editor with tabs from the real recent files, a gutter that shows green bars for the
  lines being typed and a red mark where lines went, an occasional squiggle, a minimap, a status bar with the real branch and
  a dirty dot and the real language; Read is the same editor without a caret; Bash is a terminal under the real command head,
  its output streaming in bursts; a test command is a runner on QA, review, security and platform desks; a diff command is a diff,
  other git is a commit graph with the real branch and counts; WebFetch and WebSearch are a browser at the real host;
  Task and its kin are an agents chat whose count is the number of real subagent calls), then the language of the real file
  (Markdown is a source and preview pane, CSS a design canvas on a frontend or mobile desk, Python, SQL or JSON a notebook on a data,
  ML or analytics desk), then what the role usually has open. While the model is writing (working, no tool running) a member
  now and then alt-tabs to its role's reference window. A change of view slides over a copy of the old one.
- **Variety is seeded and kept apart from the facts.** A desk's profile (`desk-profile.ts`): a dark or light theme (70/30),
  one of three window looks (traffic lights left, controls right, flat), a second monitor on some roles (a shared, slowly
  repainted window of docs, a page, a log, a chat or a dashboard, standing where the desk's side pane is), a lock-screen
  wallpaper, and one to three things on the desk (mug, plant, figure, headphones, notepad, sticky notes), all merged into a single
  mesh. Roles lean the odds (writers have notepads). The weights live in one table and a test keeps 200 members within them.
  The code is generated per language from the real extension (`screen-codegen.ts`: balanced brackets, indentation, names drawn from
  the file's own words); typing runs in human bursts and pauses (`screen-motion.ts`), the view scrolls by easing, and a
  notification slides in now and then. What is shown depends only on the member, the tool and the file, so a change of
  context share, quiet minutes or title never reshuffles it (a test holds this).
- **Cost.** One canvas of 640 by 400 per working member, painted only when due: every 200 ms within 10 m of the camera, 500 ms
  within 24 m, one second beyond, never twice within 100 ms, and only on a change of facts under reduced motion. The title
  bar's look is drawn once and copied; scanlines are one shared canvas; a transition borrows a pooled canvas for a third of a
  second; second monitors share one texture per look. Nothing in `useFrame` allocates.
- **Behavior** (`behavior.ts`, `use-micro-actions.ts`, `Poser.tsx`): a seeded director gives each seated member small
  actions from a weighted table by what it is really doing: while the model writes it leans back to think, scratches its head,
  looks about or sips; while reading it nods; at the keys it takes short hands-off pauses and glances at the second monitor
  more when it has one; in review it thinks and nods; on an error it shrugs (a facepalm) as the state turns; after a
  long quiet (8 minutes) an idle member yawns (the stretch clip has a yawn) more; finishing a turn earns a quiet cheer. An idle
  member never thinks or nods (that would claim work or a decision). Species lean the table (cats stretch, rabbits stay alert,
  pandas sip), busier members rest less and wait less, no action repeats inside two, waits are seconds and never a metronome, and
  members differ in phase and in their own slow sway of the chair (up to 10 degrees) and lean. Reduced motion is one calm
  idle with no actions and no sway; distant members sway at the distance's animation rate. The models carry no clips for a phone check
  or a facepalm, so those map to the existing ones; adding a clip means the full pipeline in
  [development](development.md#the-animals).
- **Preview.** `?intensity=N` gives every member a different stand-in desk and role, in turn, so every kind of screen shows up.

## Context window, compaction and provider marks

- **Context share** is `usage.contextPct` on a local session: the latest request's input side (Claude: input plus cache
  creation plus cache read of the last assistant message; Codex: `last_token_usage.input_tokens` of the last `token_count`)
  over the model's window. The window is Codex's own `model_context_window`, else the detected catalog's figure, else
  Claude's 200k (1M for a `[1m]` model, and 1M once more than 200k is in use: Claude Code does not write the long-context
  choice into the transcript, so a 1M session below 200k reads as a share of 200k). Unknown stays `null`, never zero.
  One rule colors it everywhere (`contextLevel` in `packages/office-scene/src/environment/context.ts`): calm under 60%, warm (amber)
  from 60 to 85, hot (red) above 85.
- **In the office** a thin column beside each desk monitor fills from the desk up (`ContextGauge`, chosen over a ring on the
  name tag because it still reads at overview distance, where tags are hidden); its fill moves with an eased tween (0.4 to
  1.4 s, longer for a bigger move). The name tag shows the percentage on hover and selection; the desk screen shows it in
  its footer (and on the lock screen); the panel header meter and a hairline bar in each feed row use the same value.
- **Compaction** is noticed from two kinds of evidence (`apps/web/src/features/conversation/compaction.ts`, pure, one tracker per
  session): the CLI's own marker (Claude `system` entry with subtype `compact_boundary`, Codex item type `compacted`; the
  server returns its time as `usage.compactedAt`) and a fall of the context in use to under half and by more than 20k
  tokens between two observations of the same window. A fall that follows a marker within 90 s is the same compaction, a
  model switch (different window) and a new session are not compactions, and a marker already in the transcript when a session
  first appears counts only if under 30 s old. When one is noticed the page hands it to the scene for 3 s: the member's
  sheets of paper burst out and are drawn into a small glowing cube above its head (one `Points` draw plus a cube and a ring,
  2.5 s, `CompactionEffect`), the gauge's fill shrinks, and a chip under the name tag says "compacted −N%" (translated in zh-TW).
  Reduced motion keeps only the chip and the gauge's tween; low quality draws none of it (the gauge still moves).
  `?compact=1` previews it on stand-in members every 8 seconds.
- **Provider marks** (`provider-marks.tsx`) are small decorative provider indicators: inline SVGs on a 24 by 24 grid, drawn
  from a few strokes (Claude: a starburst of eight rays in its own color, `--provider-claude`; Codex: a knot of three
  interlaced loops tinted to the muted text color, not a brand color), and the same strokes are drawn on the desk screen's
  header canvas. They are simplified, not copies, and belong to their owners (Anthropic, OpenAI): they only say which
  provider a session runs on, imply no endorsement and are never the app's own logo or branding. The SVG is `aria-hidden`; the
  provider's name is its tooltip and a visually hidden text, so the name, not the mark, carries the meaning. This follows the
  practice of the Happy project (slopus/happy, MIT), which shows a vendor mark only as a small provider indicator. They show
  on a name tag only when the camera is within 30 m of it or the tag is selected or hovered, and always in the feed row and
  the conversation header.

## Avatars

A character's portrait is its own animal, drawn from its id alone (`apps/web/src/avatar/`, pure; nothing is stored).
`avatarSpec(seed, species)` seeds a small stream (FNV-1a into mulberry32) and picks: fur, accent and backdrop hues shifted
inside curated ranges of the 3D model's colors (`tools/blender/animal_profiles.py`), one of eight eye styles, six mouths, a
blush, a species marking (stripes, spots, blaze, a dog's patch; the panda's eye patches and the raccoon's mask are always
drawn), ear tilt and size, and zero to two accessories. Accessories live in slots (head, eyes, audio, neck, face), at most one
per slot, headphones never sit under a hat, and tall rabbit ears take no beanie or cap. The role does not bias the choice: an
avatar is a function of the id and species only, so it never changes when a classification flips. The backdrop is the light or
dark tint that gives the fur at least 3:1 contrast, so a portrait reads on both themes.

- **State** (`avatar/state.ts`) swaps only the eyes and mouth and adds one mark: working = focused eyes and a sweat drop,
  needs you = wide eyes and a red `!` badge, finished = smile and a green check, sleeping/offline = closed eyes and "zz",
  error = crossed eyes, idle = the base. Feed rows and the phone sheet take the state from the row's bucket, other places
  from the agent's activity. The provider mark stays on the name tag, never in the portrait.
- **Component** `features/Avatar.tsx`: an `<img>` of a cached data-URI SVG (no inline HTML), `aria-hidden` next to a name,
  `role="img"` with a `label` when alone. Sizes are tokens (`--avatar-chip/row/member/peek/card`); the box is fixed, so
  switching a state never shifts layout. `avatarUrl` (module-private) builds that cached data URI.
- Every portrait is under 4 KB of SVG. Tests: `tests/aether/avatar.test.ts`.

## Interactions with the characters

The person can act on a character directly in the 3D office. Everything below is drawn over the canvas
(`packages/office-scene/src/components/InteractionLayer.tsx`, styled in `styles/character-menu.css`) and never takes the pointer from
orbiting: the layer is `pointer-events: none` except the menu, the group bar and the toast.

**Ways in.** A character is reached by its 3D model and by its name tag, which is also the keyboard's way to it (the tag is a
button: Tab to it, `aria-haspopup="menu"`, an `aria-label` of name, role and state).

| Gesture                                        | Does                                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| click, tap                                     | chooses the member (camera and panel as before); a second one on the chosen member opens its menu |
| right click, Shift+F10, press-and-hold (touch) | opens the menu (and chooses the member)                                                |
| Enter or Space on a focused tag                | opens the menu at once                                                                 |
| Shift + click, Shift + drag on the floor       | adds to a group / draws a marquee; a floating bar offers the group actions             |
| Alt + drag (a model or a tag), desktop only    | carries the member's desk to another seat (see below)                                  |
| hover (a mouse), 300 ms                        | a card with name, role, state, context share and current tool; a ring under the model; the cursor becomes a pointer |
| Esc                                            | closes the menu, cancels a carry, clears a group, in that order                        |

**The action menu** (`CharacterMenu.tsx`) is a floating `role="menu"` beside the character, kept inside the canvas (it scrolls
inside a short one), with arrow keys, Home and End to move and focus returning to the character's tag when it closes. On a
phone the same items are a bottom `Sheet` with 44 px rows. Every action is always listed; one that is not possible is disabled
(`aria-disabled`, still focusable) with a one-line reason under it. What is possible is decided by one pure model,
`apps/web/src/features/office/character-actions.ts` (table-tested in `tests/aether/character-actions.test.ts`), from the kind of
member (managed agent, observed session, subagent), the signed-in role, whether the session runs in an AETHER terminal
(and whether another person holds it), whether it is working, whether it is a clock-out candidate:

- **Open conversation**, **Show in feed**, **Follow camera** (a toggle: the camera flies to the member and keeps it in frame
  until the person drags, zooms or presses a camera key; the director yields while it lasts), **Look at screen** (a close-up of
  the desk monitor from the sitter's side), **Pin to wall** (a toggle: the member always gets one of the small live views, busy
  or not; off on a phone, low quality, reduced motion or when the wall is full).
- **Quick message**, **Quick replies** (continue / yes / no), **Interrupt** (Esc) go through the composer's own terminal driver
  (`terminal-driver.ts`: a lease, one ordered run of writes), only for a session that runs in an AETHER terminal that is free
  and not working (Interrupt: working). A sent message appears in the conversation as a pending bubble like any other. A
  session AETHER only watches shows **Continue in AETHER** in place of Quick message, and **Fork in AETHER**, **Copy resume
  command**, the same flows as the conversation's foot.
- **Stop session** (a confirm; an AETHER terminal for an owner or operator, or the process of a forgotten or ownerless session
  for the owner, as on the Sessions page) and, for a clock-out candidate, **Send home** (the clock-out dialog with just this
  session; owner only).

**Emotes** (Wave, Thumbs up, High five, Cheer, Stretch, Pat) are only drawn: a clip the animal already has (`emotes.ts` maps each
to one of `wave`, `nod`, `celebrate`, `cheer`, `stretch`, there being no thumbs-up clip, a nod stands in) plays once over
what the member is doing, and an icon rises over its head for 1.8 s. One per character per 2.5 s (a second is refused with an
announcement, not queued), at most four icons at once, not for a sleeping rabbit, a ghost or a member leaving. Reduced motion
plays no clip and the icon only fades. Nothing is sent to the session. The clip is asked of the scene's one pose registry
(`use-pose-cues.ts`, see [office life 5.6](design/office-life.md#56-poses-one-registry-for-what-a-member-does-pose-cuests-use-pose-cuests-lifeposests)):
the person outranks a hand-over's nod, which outranks a life effect's gesture, and a lower request never interrupts a higher one still
playing.

**Carrying a desk** (desktop, owner or operator): Alt + drag shows a ghost of the desk's footprint on the floor, snapped to
the layout editor's 0.5 m grid, green where the layout rules allow it and red where not (the message says whether it is out of
the office, blocks an aisle or overlaps something: the check is the kernel's `validateLayout`, the same as the editor, an import
and the API). Release on green saves the layout through `layout.save`, release on red or Esc cancels, and a toast offers Undo
(which saves the previous layout again). A session AETHER only watches has its seat saved too (the layout accepts `local:`
members); desks of sessions that are gone are dropped when a seat is saved so remembered seats do not pile up. A plain drag
is always the camera: without Alt nothing moves.

**Which desk a member gets** (no saved layout, the normal case for a project AETHER only watches). A member keeps its desk
(floor and slot) for as long as it stays in the office, whatever the order of activity: a session that writes does not move
anyone, so a name tag, the camera's target and an open action menu stay with the same character. `assignSeats`
(`packages/office-scene/src/environment/layout.ts`, pure) takes the desks already held and the members present: those who hold one keep
it, each new arrival takes the first free slot on its floor (the next floor with room when that one is full), a departure just
frees its slot for a later arrival (nobody is compacted), and a seat that is invalid or shared is ignored. The first render has
no held desks, so the arrangement is as before (most recently active first). `useSeats` keeps the map per project in
`localStorage` (`aether-seats:<project id>`, schema version 1, session ids and two integers only, at most 512 entries, any
unreadable value ignored) so a reload seats the same people at the same desks; a list that is empty (not loaded yet) never
overwrites it. A saved layout is never rearranged, and the desks of a member a saved layout does not seat, and of a subagent
whose squad zone does not fit, are still the first free slot at the time (not remembered). Squads and floors are unchanged.

**Groups.** Shift + click adds the chosen member and another to a group, Shift + drag on the floor selects every character
inside the rectangle (gold ring and tag). The bar offers Send home (the clock-out dialog with only the group's candidates:
running, quiet a day or more, owner only; it lists exactly those and asks to confirm), Pin / Unpin, Copy resume commands and
Clear selection.

**Accessibility.** Every action is reachable from the keyboard; each change (menu opened or closed, an emote, follow, pin, a
seat moved or refused, the size of a group) is spoken through one polite live region; reduced motion removes clips, rising
and the follow's easing; both locales.

## Loading performance

Text and model files are served pre-compressed (the build writes `.gz` and `.br`), hashed assets are `immutable`, JSON
answers are gzipped, and polling backs off when the event stream is up. A page's first load on a phone stays under 1 MB.

### Phone budgets and what was measured

Measured in headless Chrome with `--use-angle=metal` (`ANGLE Metal Renderer: Apple M4`) emulating a Moto G Power class phone
(412 by 915, device pixel ratio 2.625, 4x CPU throttle, Wi-Fi / Fast 4G / Slow 4G profiles), 12 sessions, one run per cell unless
a range is given; run-to-run noise on timings is about 100 ms, so bytes and main-thread totals are the firm numbers. WebKit could
not be run (the installed build does not match this Playwright), so nothing below is an iOS measurement.

| Budget (phone, first load)                           | Now                                                                  |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| Page and styles (no 3D office, no panel)             | 203 KB brotli over 43 files (251 KB before the first-load round, 186 KB right after it); the build budget is 200 KB, see below |
| 3D office on top (engine + 8 characters at LOD 2)    | 2.3 MB: engine 266 KB brotli, characters 8 x about 260 KB gzip       |
| The panel does not wait for the office               | Slow 4G: panel ready at 2.2 s with the office and at 2.2 s without   |
| Interaction on the panel (sheet open, tap a row)     | 96 ms event with the 3D office off, 240 to 340 ms with it running (4x CPU) |
| Scene cost while nothing happens                     | 14% of the main thread at 4x CPU (4% for the page without the scene) |
| GPU memory of the scene (`renderer.info` estimate)   | 57 MB, 111 draw calls, 86 k triangles, 15 programs                   |

The scene already redraws about 20 times a second on a phone, draws on demand and stops while the tab is hidden. What this
round changed: the entry bundle no longer carries zod (the event stream is checked by `stream-event.ts`; the schemas load with
the pages that use them), entry gzip 218 to 187 KB (brotli 182 to 157), first load without the scene 212 to 189 KB, first contentful
paint 628 to 496 ms on Fast 4G and 1.6 to 1.5 s on Slow 4G; and **the scene stops drawing while the full-height sheet covers it**:
main-thread time over 3 s with the conversation open fell from 1.0 to 1.3 s to 0.07 to 0.29 s (4x CPU), and of 32 pointer events in
the sheet, 20 to 23 had been slow (16 ms or more, worst 54 ms) against 0 to 8 (worst 18 ms). Closing the sheet costs one catch-up
frame (the event goes from 250 to 330 ms to 450 to 660 ms at 4x CPU), a trade made for the time spent reading.

First-load JavaScript round (build and loading): the language tables are one chunk each and only the active one is fetched (the
settings search is the one place that loads both); the conversation panel's body (`PanelBody.tsx`: feed, transcript, Markdown) is a
lazy chunk fetched 1.5 s after load, so a first click on a row does not wait for it; zod is out of the entry again (the session
limits are in `contracts/src/session-limits.ts`). The first-load total fell from 251 to 186 KB brotli (the `first-load` rule of the
scorecard; `scripts/check-bundle-size.mjs` budgets are 870 KB total and 400 KB for the largest chunk). Measured on the phone
profile (390 by 844, 4x CPU, cache off, median of 5) on Slow 4G (1.6 Mbps, 150 ms): first contentful paint 1.85 to 1.67 s, app
ready 2.63 to 2.28 s; with no network limit the difference is below the run-to-run noise (about 300 ms).

The first-load total has grown since that round, with the office-life and shell work, to 203 KB brotli (231 KB gzip, 714 KB
raw): react-dom is 202 KB of the raw size, the kernel 38, react-router 36, the query cache 32 and the office feature 31. That
is 3 KB over the 200 KB budget of the `first-load` rule, and the one budget of the scorecard that is not met. Most of what is
left is not the app's own code: splitting the remaining routes would save about 6 KB gzip, and going further means replacing
the router or the query cache, which costs more than it returns.

Tried and left out: `content-visibility: auto` on feed rows (150 sessions: opening the sheet takes 180 to 280 ms against 96 ms at 12,
and the change measured no difference, because the cost is the first render, not layout), and a list library (not needed under
about 150 rows). Texture compression (KTX2) is not worth a transcoder at 57 MB of GPU memory. The numbers come from
Playwright with the Chrome DevTools protocol and the `?perf=1` probe; no measuring tool is added to the repository.

### Field performance report (`?fieldperf=1`)

The maintainer-facing JSON report (copy button, schema `aether-field-perf/1`) reuses `PerfProbe` / `perf.ts` for the `scene`
block and collects rAF frame times, navigation paint entries and `/api` fetch counts in a lazy-loaded chunk. APIs below are
what the report reads; anything missing is `null` and named in `unsupported` (sources: MDN, WebKit feature status, Chrome
Platform Status, checked 2026-10-08).

| API | Chrome Android | Safari iOS | In the report |
| --- | --- | --- | --- |
| `PerformanceNavigationTiming` | Yes | Yes | `startup.navigationType`, DCL / load |
| `PerformancePaintTiming` (FCP) | Yes | Yes (16.4+) | `startup.firstContentfulPaintMs` |
| `Largest Contentful Paint` | Yes | Yes (16.4+) | `startup.largestContentfulPaintMs` |
| `PerformanceObserver` `longtask` | Yes | Limited / often absent | `longTasks` or `null` |
| `PerformanceObserver` `long-animation-frame` (LoAF) | Yes (123+) | No | `loaf` or `null` |
| `performance.memory` | Yes (Chromium) | No | `memory` or `null` |
| `navigator.deviceMemory` | Yes | No | `device.deviceMemoryGb` or `null` |
| `navigator.hardwareConcurrency` | Yes | Yes | `device.hardwareConcurrency` |
| `Network Information` (`navigator.connection`) | Yes | No | `context.connection` or `null` |
| `navigator.getBattery` / low-power mode | Deprecated / not low-power | No | `context.lowPowerMode` always `null` |
| `Service Worker` `controller` / registrations | Yes (secure context) | Yes (secure context) | `context.serviceWorker` |
| `matchMedia('(display-mode: …)')` | Yes | Yes (standalone via Add to Home Screen) | `context.displayMode` |

When a ring buffer fills, the JSON marks `truncated: true` on the affected block and keeps only the newest retained
entries in `entries` (or `deltasMs` for frames). Session totals (`sampleCount`, `count`, `droppedFrameCount`,
`totalBlockingMs`, `totalDurationMs`, and similar) still reflect the full capture window; percentiles and maxima use the
retained slice only (`percentilesFromRetainedWindow: true` on `frames`). Caps: `frames.maxRetainedSamples` (36 000),
`longTasks.maxRetainedEntries` (600), `loaf.maxRetainedEntries` (3 600).

## Installable app (PWA)

`manifest.webmanifest` carries `id`, `scope`, `display` with `display_override` (`standalone`, `minimal-ui`), `lang`, `categories`,
icons (any and maskable, 192 and 512) and shortcuts to Sessions and Approvals. `index.html` has `viewport-fit=cover`, the iOS web
app tags (`black-translucent` status bar, so every pinned surface pads with `--safe-top` and friends from `tokens.css`),
`theme-color` for both schemes (kept equal to `--surface` of the chosen theme by `App.tsx`), `100dvh` heights,
`overscroll-behavior-y: none` and inputs of 16px on a phone. `PwaNotices` shows the install offer (Chromium's
`beforeinstallprompt`, or on iOS the Share steps, once; a dismissal is remembered) and the update notice. The service worker
(`apps/web/src/sw`, built by `scripts/build.mjs`) keeps only the page and hashed files, registers only in a secure context
and waits for the person before updating; see [security](security.md#the-service-worker). Screenshots are not in the manifest:
Chrome's richer install sheet wants them, but they would be tracked binaries that go stale with every redesign.

## Performance and quality tiers

Measured on a real GPU (headless Chrome with `--use-angle=metal`, `ANGLE Metal Renderer: Apple M4`, vsync off), 12 members at
`/office?intensity=3`, device pixel ratio 2, `?perf=N` probe (`PerfProbe`, which also leaves `window.__aetherPerfRig.sample(n)`
for re-sampling after a script switches a piece off). Software rendering (SwiftShader) numbers mean nothing and are not quoted.

| Tier     | Pixel ratio (cap) | Shadows                            | Characters                      | Air, desk glow, threads | Wall | Programs | GPU memory (est.) |
| -------- | ----------------- | ---------------------------------- | ------------------------------- | ----------------------- | ---- | -------- | ----------------- |
| low      | 1                 | none (soft footprint under each)   | LOD 2                         | none (attention ring on) | no   | 19       | 67 MB             |
| balanced | 1.5               | 2048 map, redrawn at about 12 Hz   | LOD 1                           | 110 motes, 3 shafts     | yes  | 42       | 108 MB            |
| high     | 2                 | 4096 map, redrawn at 20 Hz         | LOD 1 (selected: LOD 0)         | 240 motes, 5 shafts     | yes  | 42       | 210 MB            |

A phone (`compact`) is low-like (no shadows, no air, footprints) at a cap of 2 on high and 1.5 on balanced (`PIXEL_RATIO_CAP_PHONE_HIGH`, see "Mobile quality" below). Reduced motion freezes the air and
the breathing of lines and rings and never turns members toward each other. The pixel ratio of every tier may fall to 0.75 (see below).

**Where the time goes** (high, wall off, 1440 by 900; frame time p50 in ms, switching one piece off): all 3.0, shadows off 1.5,
characters off 2.7, static building off 2.9, desk screens off 2.9, additive effects off 2.8, name tags 2.9 (DOM, not the GPU). The shadow
pass is the cost: 27 casters, 122,000 of their 156,000 triangles are the twelve skinned characters, drawn again into a 4096 map
every frame. Of the JS main thread (about 5% of one core while ambient), program lookup per object is 20%, skeleton bone
uploads 13%, matrix updates 10%.

**What was done, and what it measured** (same build, interleaved runs of the probe; p50 / p95 ms):

| Change                                             | 1440x900 wall off | 1920x1080 wall on |
| -------------------------------------------------- | ----------------- | ----------------- |
| Before                                             | 3.1 / 5.7         | 6.3 to 6.8 / 14   |
| Shadow map redrawn at 20 Hz, not every render       | 1.85 / 3.7        | 5.4 to 5.8 / 13   |
| Animation updates by distance (30, 15, 5 Hz)       | within noise (0.3 at 1080p, 12 members) | |
| Warm-up behind the loading cover                    | no frame-time change; worst startup frame 250 to 325 ms down to about 150 to 215 ms | |

At the scene's own pace (no probe; CPU seconds of the renderer and GPU processes over 20 s, one run each, so read the order and not
the decimals): the moving camera went from 5.7 and 5.6 to 4.9 and 4.4, the 1080p wall from 5.7 and 4.5 to 4.6 and 3.0, a still
camera with the wall off did not move (2.1 and 1.5 against 2.0 to 2.4 and 1.4 to 1.6). The new air, desk glow, rings and lines cost
under 0.1 ms (alternating on and off in one page, four rounds).

**Rules the code follows** (pure parts in `perf-control.ts`, `interplay.ts`, `air.ts`, tested in `tests/aether`):

- The shadow map does not depend on the camera and what casts into it moves slowly, so `ShadowThrottle` redraws it every 50 ms (high)
  or 83 ms (balanced), and schedules one more render if a change would otherwise wait. The extra views of the wall never redraw it.
- A character farther than 22 m from the camera updates its mixer at 30 Hz, from 45 m at 15 Hz, from 90 m at 5 Hz; the time it skipped
  is applied in one step. The selected member always runs at full rate.
- `AdaptiveRatio` (dynamic resolution): over a rolling median of 30 frames it steps the pixel ratio down by 0.25 when frames run 40%
  over the target (60 Hz while the camera moves, 30 Hz at the ambient pace, 15 Hz on a phone whose idle redraw is 50 ms), never under 0.75, with a 1 s cooldown; it steps back up
  after 90 frames within 5% of the target and a 4 s cooldown, and doubles that wait when a step up had to be undone. It never rises
  above the screen's own ratio or the tier's cap. Gaps over 250 ms (an idle scene) are not frames.
- `Warmup` compiles every program with `compileAsync` while the canvas is held back behind a "Preparing the scene" cover (at most 4 s),
  and each character's shaders are compiled before it appears. It compiles variants a frame never uses, so the program count doubled (21 to 42).
- Floors above the focused one and members on other floors are not drawn (cutaway), floors are merged per material (about 35 meshes),
  and the ambient pace is 24 ms (see `AnimationClock`); none of that changed.

**Not done, because it did not pay or was not measurable here**: instancing of furniture (a floor is already about 35 draws),
`matrixAutoUpdate = false` on the building (matrix updates are 10% of a JS main thread that is idle 95% of the time), pooling the desk
canvas textures (they repaint only when facts change or twice a second), a post-processing bloom pass (emissive materials and additive
planes carry the glow instead), swaying plants and ceiling flicker (the plants are merged into the floor's geometry), zone floor
markers (the lit pads already mark them). Integrated GPUs and phones were not available to measure: the adaptive ratio and the
shadow throttle are aimed at them, and are unproven there.

### Mobile quality (P1: dithering, textures, pixel ratio, MSAA, context loss)

Evidence and the sources are in [the mobile gradient research](internal/mobile-gradient-perf.md). Every number below is one
machine (Apple M4, `--use-angle=metal`, Chrome), phone profile 390x844 at dpr 3 with a 4x CPU throttle, the repository's
`scripts/perf-matrix.mjs` with interleaved A/B rounds; the display holds 16.7 ms, so p95 stays 18.3 to 18.6 ms in every case and the
evidence is `jsMs` / `renderMs`, draws, programs and the GPU estimate. **Nothing here was measured on a real phone, on Safari or on another
GPU.**

- **Dithering (`dither.ts`).** The soft additive gradients (light shafts, squad beam and zone decal, clouds, holograms, petals,
  pollen, glass strands) take three's `dithering` last. Three adds its noise to the colour _before_ the alpha multiplies it, so on a
  low-alpha ramp the noise is scaled away: on a synthetic additive strip (dark background, alpha 0 to 0.09) the row-mean error was
  0.291 LSB without dithering and 0.278 with the flag alone, and 0.025 with `premultipliedAlpha: true` plus the chunks
  (`DITHERED`, `DITHER_PARS`, `DITHER_END`). Premultiplied blending is the same result for additive and normal blending, adds no
  programs (the shaders already had their own) and cost nothing measurable (draws, programs and p95 equal; `jsMs` and `renderMs`
  inside the round-to-round noise in six A/B sets). In the real scene the surfaces are a small part of the picture and a crude
  "identical neighbours" metric on a crop barely moved (0.807 to 0.794), so the strip, not the scene, is the proof. Not dithered: the
  nebula sprites (three's `SpriteMaterial` has no dithering chunk), the planet halo, the desk glow and the sprite atlas, because a
  built-in material with the flags is a new program variant (the programs must not grow) and the phone draws none of the gradients
  among them. No noise is visible on the phone, or under reduced motion, in screenshots at dpr 3.
- **Texture sizes.** The planet is painted at 1024x512 on a phone and on the low tier (`earthTextureSize`), 2048x1024 elsewhere:
  GPU estimate on the phone profile 57.3 to 48.0 MB (low 54.5 to 45.2), desktop unchanged, p95 and draws equal. (The backdrop's `low`
  already meant "phone or low".) The sprite atlas stays 1024x512, the nebula glows 256x256 and the soft discs 64x64.
- **Pixel ratio caps** are one named constant per tier in `perf-control.ts` (`PIXEL_RATIO_CAP_PHONE_HIGH` = 2, `_PHONE_BALANCED` = 1.5,
  `_DESKTOP_HIGH` = 2, `_DESKTOP_BALANCED` = 1.5, `_LOW` = 1), read through `pixelRatioCap(quality, compact)`; `AdaptiveRatio` still lowers
  them (to 0.75) while frames run slow, and the screen's own ratio caps them. The phone's `high` was 1.5, identical to its `balanced`; it is 2 now
  (phone profile: GPU estimate 49.3 to 53.2 MB, draws and programs equal, p95 18.4 to 18.5 ms, `jsMs` 4.6 to 5.3 within the noise). The default tier
  is still `balanced` and is not chosen from the device, so no phone lands on `high` by itself. **A phone at pixel ratio 2 has not been validated:**
  the maintainer must try an iPhone (Safari) and an Android phone (Chrome) on `high` for five minutes each (p95, dropped frames, the frame time after
  the phone warms up) and revert the constant to 1.5 if either struggles. The quality help text does not mention pixel ratios, so it is unchanged.
- **`AdaptiveRatio` on a phone (a bug found while investigating).** The idle phone scene redraws every 50 ms (`AMBIENT_FRAME_MS_PHONE`) but
  the controller judged it against 33 ms (slow from 47 ms), so every frame counted as slow and the ratio fell from 1.5 to 0.75 within about
  6 seconds (measured: canvas pixels per CSS pixel 1.5, 1.5, 1.5, 1.25, 1.25, 1, 0.75, 0.75 ... at 1x CPU). The phone's ambient target is now
  its own pace plus one 60 Hz frame (`frameTargetMs`), and the ratio stays 1.5 at 1x and 4x CPU. A phone that really is slow (frames past
  about 93 ms) still steps down.
- **MSAA is not changed** (off on a phone and on low). `?msaa=1` or `?msaa=0` overrides the tier (`antialiasFor`), so it can be measured on a
  phone: load `/?perf=240&msaa=0`, then `/?perf=240&msaa=1`, at the same tier and size, five minutes each on an iPhone and an Android
  phone, alternating (the context is made at load, so reload to switch). Compare p95 and dropped frames from `window.__aetherPerf`, and look
  at the edges of the desks and the grid. On the M4 the two were indistinguishable (16.7 / 18.5 ms), which says nothing about a phone. With
  `scripts/perf-matrix.mjs` the case is `--cases 'off=;on=msaa=1'`.
- **Context loss.** A lost WebGL context (iOS does it to a page in the background) used to switch silently to the list with a notice.
  Now the scene is replaced by a card, "The 3D view was interrupted by the device", with **Reload the scene** (remounts the canvas for a
  new context) and **Use the list**. A browser-restored context redraws by itself (`onContextRestored`). Other scene failures (no
  WebGL at all, a model that fails to load) still fall back to the list. Tested with `WEBGL_lose_context` in Chrome
  (`e2e/scene/scene-context.spec.ts`); whether Safari fires the event for a backgrounded page was not observed.
- **What the transparent objects are (R4), phone profile, `?intensity=3`, 4x CPU, hiding one class at a time (`renderMs` of a 6.0 ms baseline, 195 draws):**

  | Class (layer, why transparent)                                 | Objects | Draws saved | `renderMs` saved | Instance / merge / opaque?                                        |
  | -------------------------------------------------------------- | ------- | ----------- | ---------------- | ----------------------------------------------------------------- |
  | Screen code band (`MemberScreen`, opacity .9) and context gauge backing (`ContextGauge`, .75) | 24 | 24 | 1.7 | one material per member; merging needs shared instanced pools |
  | Desk screen plane (`MemberScreen`, opacity .12 / .5 / 1)        | 12      | 12          | 1.1              | opaque when working would not change the cost (below)             |
  | Contact shadow (`DeskGlow`, black plane, phone has no shadows) | 12      | 12          | 0.3              | needed: it is the phone's only ground contact                     |
  | Smoke and spark points (`DeskEffects`, intensity 2 and 3 only) | 24      | 24          | 0.2 + 0.2        | exist only at all-out effort; a shared texture was tried (below)  |
  | Status gems (`Labels`, octahedra, opacity .95)                 | 12      | 12          | 0.5              | opaque (.95 to 1) would not change the cost                       |
  | Planet shells and rings, stars                                 | 5       | 5           | 0.3              | backdrop, one each                                                |
  | Building holograms and glass                                   | about 10 | about 10    | not isolated     | additive, one material each, merged per floor already             |

  Everything adds to the 102 transparent objects (hiding all: 49 draws, 2.0 ms). **Converting transparent to opaque changed nothing**
  (octahedra and working screens: 5.5 to 5.6 ms), and **sharing the smoke texture** (one canvas instead of one per member) changed nothing
  measurable (GPU estimate 61.8 to 61.6 MB, `renderMs` equal), so neither was kept. The cost is per draw call and per material, not blending or
  sorting; the only real saving is fewer draws, by moving the per-member screens, gauges and shadows into shared instanced pools, which is a
  refactor of `Member` and was not done. Skipping layers on a phone would change what people see for 0.2 to 0.5 ms each, so it was not done either.

## Alive and futuristic, cheaply

- **Air.** Dust motes (one `Points` draw, positions animated in the vertex shader) and a few window light shafts (one mesh), both
  tinted by the local hour: cool blue at night, warm gold by day, easing through dawn (5 to 8) and dusk (17 to 20). Focused floor only.
- **Desk.** The screen's light spills on the desk in the department's color while the member works (stronger the harder it works);
  a member who wants a person has an amber ring pulsing on the floor round the desk; where there are no real shadows (low, phone) a
  soft footprint sits under each character.
- **Messages.** While a message is current the sender and receiver turn toward each other (at most 0.5 rad, a glance), a glowing
  envelope arcs from the sender's head to the receiver's in 1.8 s, and the receiver nods when it lands. Subagent work stays a stream
  of light and only the subagent looks at its parent. Links fade with distance from the camera (full under 30 m, gone at 110 m).
- **Threads and tethers.** With a member hovered or selected, a thin cyan line joins it to the members of the same repository (else
  the same branch) on the floor, nearest six; a violet tether joins every session to its live subagents (brighter for the member in
  hand). One fat-line draw call, drawn only for the focused floor and faded with distance. Subagents sit in their parent's squad
  zone (see Squads below); only when a floor has no room for a zone do they keep desks of their own, and then the tether is what
  joins them.
- `?talk=1` previews all of it with stand-in traffic (see `scene-preview.ts`).

## Squads in the scene

`packages/office-scene/src/squad/` draws a supervisor's subagents and the squad's beam; the scene mounts `SquadLayer` (in the
canvas) and `SquadDom` (the label buttons and the log, in the label layer) and reads every seat through the layout `useSquad`
returns, in which each pod is a desk-like seat that carries the subagent's id (so the camera, the name tags, the director and the
selection find a subagent as they find a member). The floor is not rebuilt: the zone, the supervisor's dressing and the beam are
overlays.

- **State.** `stepSquad` (pure) keeps who sits where: the lowest free seat, never reassigned while held, the zone's size (grows at once,
  shrinks after 10 s with no walk in flight) and the tool starts of the last minute. Poses are functions of `now - since`, so a
  frame never depends on how many frames ran.
- **Draws.** The zone decal (one shader, a dashed outline and a soft fill), the seat rings, the hover stools, the holo panes, the
  silhouettes, the desk dressing, the beam funnel, the filament, the halos and the points are one instanced mesh each: 10 draw calls
  (9 while no one stands as a silhouette) for any number of squads, 4 shader programs (decal, beam, points, one instanced basic;
  6 to 7 with the glow and opaque materials, the strings and the seal, see office life 4.9). Every layer writes an instance's matrix
  and colour only when it differs from what the mesh holds, so a still squad uploads nothing, and `SquadWarm` links all of these
  programs while the scene loads (one hidden copy of each, from the layers' own factories), so a squad's first appearance links none. The
  puppet strings add 2 draw calls (all strings, all crosses) and the hand-over 1 (all folders and stamps) plus one for each stamp word
  on show, so at most 13 (typically 12, 14 with silhouettes and both words on show); the strings add the fat-line program the relation lines
  already use. Parts share one vertex-coloured material per kind and are built once.
- **Beam.** An instanced tube whose centre line is a Bezier evaluated in the vertex shader (squad, then the core, then a thin
  filament to the supervisor's halo). Edge glow, bands that flow into the core, a fade at both ends and near the camera;
  brightness follows the squad's tokens per minute (tool calls per minute when there are none) through
  `tanh(1.5 ln(1 + rate) / ln(1 + reference))` with a 0.6 s lag, an amber pulse while a subagent waits for a permission. The
  reference rates (24 tool calls, 8 million tokens a minute) are calibrated on real transcripts and pinned to the numbers
  documented in [office life 4.4](design/office-life.md) by `tests/aether/beam-calibration.test.ts`.
- **Tiers.** Zone, pods and dressing on every tier. High: bands, filament, halo, 48 points. Balanced: the same with 24 points. Low,
  Calm mode and reduced motion: the funnel stands still (brightness only), with no filament, halo or points; reduced motion also
  has subagents appear in their seats. Walks are 14 m (high), 10 m (balanced) or none (low).
- **Puppet strings** (`squad/puppet/`). A control cross of light floats 1.25 m over each subagent that works; thin strings run from it
  to the head and the two hands, and a master thread to the supervisor's halo. The strings are decoration that follows the
  subagent and never pulls it: light (1.4 px, additive, 25% brightness at the body end), no face or neck strings, and they fade away
  after they went slack. They are tied to the character's own `head_socket` and `hand_socket_L/R` (read from the model's world
  matrices through `registerAnchors`/`anchorsOf`, so the hand strings follow the typing clip) and to fixed offsets when a model has no
  sockets. `verlet.ts` is the simulation: six points per string in one pooled `Float32Array`, fixed 30 Hz (20 on balanced, 10 past
  45 m, held past 90 m), 3 relaxation passes, damping 0.965, a sixth of gravity, a 0.25 Hz sway. It cannot blow up: `dt` is clamped
  and capped at four steps, a pin that moves more than 2.5 m lays the string straight again, and a non-numeric pin or point resets
  it. `string-motion.ts` is what a subagent does to them: taut while it works, a 4 cm dip of the cross and a 6 cm lift of the hand
  strings (critically damped, about 250 ms) when its PreToolUse time (`tools.lastAt`) changes (never on the first look), slack over
  1 s when it rests and then gone, frozen with an amber cross while it waits for a permission. All strings are one `LineSegments2`
  and all crosses one instanced mesh (2 draw calls). **Off** on the low tier, with the relation effects, and by their own switch
  (Settings, Office, Animations, "Puppet strings", pref `strings`; `&strings=0` in a preview); **still** (straight lines, no
  simulation, redrawn at most every 0.2 s) in Calm mode and with reduced motion.
- **Hand-over** (`squad/handover/`). When a subagent finishes (running to finished, with its supervisor's desk in the zone) it stands,
  walks a folder (floating at its chest) to the end of the supervisor's desk that is nearest the zone, turns to the in-tray and glides the
  folder in (0.6 s). The supervisor reads (`reading`, 1.5 s, an existing clip played as a one-shot) and then nods; the stamp goes over the
  tray, presses (250 ms) and a seal blooms on the folder; the subagent waves and walks into the core. The stamp says **RECEIVED**
  (translated in zh-TW): a receipt that a result came back, never "approved", and it never says passed or failed. When the parent's own tool
  result for the call is flagged as an error (`result.error === true`, or `ok === false`) it is a neutral grey **RETURNED** (also translated)
  and the supervisor scratches its head instead of nodding; no red and no green are used. `plan.ts` is the pure timeline (stand,
  walk of at most 8 s, turn, glide, read, press, leave: the press within 14 s), `book.ts` the throttle and the state machine,
  `items.ts` what is drawn at a moment, `Handover.tsx` the meshes (one instanced mesh of unit boxes for every folder, tab and stamp, and
  one small mesh for each seal word: three draw calls at most), `Handing.tsx` moves the carrier. The in-tray stack shows the folders
  delivered (at most 5) and clears after 5 minutes without a new one. The log says "{type} handed over its result" (or "..., marked
  as an error") once, when the folder is in the tray.
  - **Throttle.** One hand-over per member, at most two carriers walking per floor (the next ones are shown as a pop: the subagent
    leaves as usual and the folder pops into the tray), one stamp at a time per desk (a carrier waits in its seat for at most 6 s),
    and a seeded spread of up to 0.3 s so two finishing together are not in lockstep. The mode steps down and never out, so a
    receipt is always shown: **walk** (high and balanced, desk in view), **pop** (low tier, desk not in view, floor busy) and **tray**
    (Calm and reduced motion: the folder and the seal just appear, no press, no cues).
  - **An interrupted hand-over** is cut short without a stamp when its supervisor leaves, or when the carrier vanished with the
    folder still in its hands; one whose folder was already in the tray finishes.
  - **Clips.** Everything is procedural over the existing `stand_up`, `walk`, `idle`, `wave`, `reading`, `nod` and `scratch_head`; no
    Blender clip was added. The `carry` and `conduct` clips of the spec (§4.8) are not built: the floating folder reads well in the
    contact sheet, so they wait for the maintainer's review.
- **Accessibility.** The zone label is a real button over the zone's front edge; joins, leaves and hand-overs are said through the scene's one visually hidden `role="log"` ("Office activity").
- **Preview.** `?squad=N` gives the first member a squad of N stand-in subagents (`&arrive=MS` one joins every MS, `&leave=MS` each
  finishes MS after it joined (and hands its result over), `&tools=MS` tool starts (the strings jerk), `&result=error` the finished ones come back
  flagged as an error, `&look=1` the camera goes to the middle of the squad (`&look=desk` to the supervisor's desk), `&relation=0` no dressing or
  beam, `&strings=0` no strings, `&handover=0` no hand-over, `&legacy=1` desks as before, `&after=MS` the squad first shows MS after the
  page opened). `?preview=life&effect=a,b&t=MS&loop=1` plays life effects on from `t`, over and over, instead of holding a frame (and leaves
  the camera where it is); `scripts/perf-matrix.mjs` measures them on the real GPU. Measured on an Apple M4 (ANGLE Metal) against the same scene with desks: median frame time 16.7
  ms both, 26 fewer draw calls, 4 more shader programs, no GPU memory change.
- **Puppet strings and hand-over, measured** on the same machine (Apple M4, ANGLE Metal, balanced tier, an 806 x 540 viewport, 8
  subagents in a zone, 9 interleaved rounds of 240 frames, medians, a machine that was busy). Median frame time is 16.7 ms in every
  pair. The strings alone (`&strings=0` against the scene): +2 draw calls, +1 shader program (the fat-line material), +0.1 GPU MB,
  +0.1 ms JS per frame; the layer's own frame callback was timed at about 0.04 ms a frame (instrumented once, then removed). The
  hand-over (`&handover=0` against the scene, 8 subagents finishing at once, 2 walking and 6 popping): +0 draw calls, programs, GPU MB and
  JS per frame. The beam and the dressing (the relation effects with the strings and hand-over off, against `&relation=0`): +6 draws, +3
  programs, +1.4 GPU MB, +0.1 ms. All the relation effects together: +8 draws, +4 programs, +1.5 GPU MB, +0.3 ms JS, inside the generic
  gate of the spec (19 draws, 4 programs, 4 MB, 0.4 ms) but over the I4 squad budget of 0.15 ms JS. The 0.1 ms timer resolution of the
  browser makes the JS figures coarse. A squad of 12 (which does not fit the default floor) was not measured. The high tier, both sizes
  and the phone profile (4x CPU throttle) were measured since, with a busy building, the effects looping and the first appearance
  (office life 4.9).

## KPI dashboards

Token and Git numbers for the building and for each office, shown as a strip over the office and a dashboard it opens. The
design started from how the vendors' own dashboards present token use (from their public documentation and the local data shapes; the pages
were not re-fetched when this was written, so check the names below before relying on a detail):

- **Claude Code `/usage` and `/cost`**: `/usage` shows the subscription's limit windows (current 5-hour session and the
  weekly limits) as percent bars with the reset time; `/cost` shows, for the current session, spend, duration and tokens
  by model. **claude.ai Settings, Usage** repeats the plan windows as bars with "resets in". **Claude Console, Usage and
  Cost**: tokens by model, workspace and API key, daily bars over a chosen range, input / output / cache read / cache
  creation as separate series, and cost per day.
- **Codex `/status` and the ChatGPT Codex usage page**: `/status` shows the rate-limit windows (5-hour and weekly) as a bar
  with percent and reset time, and the session's input, cached input and output tokens. The usage page shows daily bars
  over a range. The rollout files carry the same numbers: every `token_count` event holds the running `total_token_usage`,
  the request's own `last_token_usage` (input includes cached input, output includes reasoning) and `rate_limits`
  (`primary` and `secondary` windows with `used_percent`, `window_minutes`, `resets_at`).
- **Adopted**: ranges today / 7 days / 30 days; token kinds apart (input, output, cache read, cache write, reasoning);
  daily bars with a per-day tooltip; by model and by project; rate-limit windows as rings with the percent used and the
  reset as a countdown and a clock time; the heaviest sessions. **Not adopted**: cost. No price table exists on this
  machine and prices are not invented, so the dashboard says so. The headline "tokens" excludes cache reads (they dominate
  every session and are not new work); they are shown in the breakdown.
- **What the data is**: per session and day, from the transcripts (`services/usage-stats.ts`): Claude's `message.usage` counted once
  per message id; Codex's running total turned into deltas (a repeat adds nothing; a total that falls, after a reset or
  compaction, counts the request itself; the first total of a file counts only its own request). Active time is the sum
  of gaps of at most five minutes between a transcript's events, summed over sessions. Days follow the server's time zone.
- **Reuse**: the top bar's Claude quota (`quota.ts`, `ClaudeQuota.tsx`, `claude-limits.ts`, the claude-hud cache) is
  unchanged; the dashboard reads the same file through the same function and adds Codex's windows
  (`services/codex-limits.ts`, the newest rollouts' last `rate_limits`).
- **Where**: the strip over the office (`KpiStrip`), the dashboard (`KpiDashboard`, a side panel on a desktop and a bottom
  sheet on a phone, lazy-loaded), a line per deck in the floor switcher and a plaque for the floor on show (desktop only;
  `FloorKpi.tsx` in the scene package, plain DOM). Numbers count up over 450 ms by writing the text node (never a React
  render per frame; instant with reduced motion). Colors come from the `--kpi-*` tokens. Empty states are honest: local
  sessions off, no usage yet, no repository, no reading for a provider.

## Verifying a UI change

1. Audit the changed pages on real data at 390, 820 and 1280 px.
2. Run `pnpm exec playwright test e2e/ui/responsive.spec.ts e2e/ui/ui-sweep.spec.ts`.
3. For iOS behavior, `e2e/ui/touch-flow.spec.ts` drives the real flow with taps. With WebKit installed
   (`playwright install webkit`), `AETHER_WEBKIT=1 pnpm exec playwright test --project=webkit-iphone` runs it and the
   responsive spec in WebKit, the engine of every iOS browser. Added to the home screen the app opens full screen.
4. Look at the screens before committing.
