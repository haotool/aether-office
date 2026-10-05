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

`apps/web/src/styles/index.css` loads the files in cascade order: tokens, base, shell, office, inspector, controls,
pages, forms, views, login, the desktop breakpoints, the feature files (scene HUD, telemetry, transcript, git, sessions,
quick open) and finally the touch and phone layers. A rule goes in the file of the thing it styles, never in a catch-all.
The file list is documented at the top of `index.css`.

## Components

Shared pieces live in `apps/web/src/ui.tsx`: `Modal`, `Sheet`, `Fold`, `Hint`, `Clamp`, `Field`, `Badge`, `Empty`,
`PageHeading`. A feature composes them instead of rebuilding a portal, a backdrop or a close button. Buttons are the
classes `primary`, `secondary`, `icon-button` and `text-button`; a new variant is added beside them in `controls.css`.

## Responsive and touch rules

1. **Width.** A phone is `<= 760px` or a phone on its side (`pointer: coarse` and `max-height: 500px`). There, navigation
   is a drawer and the inspector a bottom sheet. Nothing scrolls the page sideways. A table that is wide on purpose scrolls
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
  lower half of the screen (56dvh; the inspector 54dvh, 88dvh on request) and render into `document.body`.
- **The camera runs itself.** The director (`packages/office-scene/src/director.ts`, `shot-camera.ts`) cuts to who is
  talking (a two-shot with an arc between them), who waits on a person or is in error, who works, and who wants a person
  (forgotten, ownerless, zombies), and sweeps a floor when nothing is going on. A touch, a chosen member or a focus
  request hands the camera to the person; after a quiet spell (10 s on a phone, 30 s elsewhere) it takes it back, but never
  while a member is chosen. It is off under browser automation (`navigator.webdriver`) so tests can hit a still target.

## Phone information architecture

First principles: a phone is for glancing, answering and dispatching, not for administering. So:

- **Glance.** The office is the home screen. What needs attention is a chip on it (the "!" list), not a page.
- **Answer.** The four tabs are the places a person acts: Office, Sessions, Tasks, Messages. Their badges count what **needs a
  person** (tasks to review, accept or look at because they failed; requests nobody acknowledged), never how many things exist.
  The badge on "More" is the approvals waiting.
- **Everything else is behind "More"**, grouped by what a person comes for: *Work* (office, team, tasks, messages), *Watch*
  (reviews, approvals, local sessions, observation) and *System* (workspace, terminals, knowledge, machines, history,
  settings). The same groups head the desktop sidebar.
- **Explanations fold.** A page title carries an "i" beside it instead of a paragraph under it (`Hint`, `Fold`, `Clamp`).
- **A member is a row** (avatar, name and role, state), not a card; a table of rows becomes cards (`table.stack`).

## Many busy members at once

- **How hard a member works** is read from real signals (`apps/web/src/features/activity-rate.ts`): how often something changed
  in its session over the last minute, the CPU of its process tree, and how many subagents work for it, giving 0 to 3. It drives
  the typing speed (a flat-out member types at 2.2x), a stream of bars that scrolls over its screen, and at level 3 smoke and
  sparks over the desk and a faint shake. `?intensity=3` in the address previews it with stand-in data.
- **A department's screen** keeps the real facts of the session and dresses them differently per department: its own title
  (BUILD, PIPELINE, CHECKS, ANALYSIS, BOARD) and an abstract ambient column; the pattern is decoration, the text is data.
- **The director** cuts faster the more members are busy (down to 55% of a shot's length) and favors the hardest worker.
- **Split view.** On a wide screen, when at least two members are busy, up to three small live views (`MultiCam`, framed by
  `PipWall`) follow the others beside the main camera; a view that is still busy stays. They are not drawn on phones, tablets or
  at low quality, where the quicker cuts do the job.

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
