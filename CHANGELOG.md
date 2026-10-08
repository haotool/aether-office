# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it has a stable release.

## [Unreleased]

### Changed (performance on a phone)

- No `backdrop-filter` blur anywhere in the web styles: the glass over the scene is a near-opaque tint (88 to 96 %) on phone and
  desktop alike, so the compositor no longer blurs a moving WebGL canvas. The saving on a real phone is expected, not measured.
- Every interval the web app polls on is one entry with its reason in `lib/app/polling.ts`. A quiet office page makes about 22
  `/api` requests a minute instead of 55: the approvals count is refreshed by the project's event stream (polled slowly only while
  that stream is down) and the permission prompts are asked for every 2.5 s only while Remote approvals is on (`GET
/api/permission-requests` now also says `enabled`).
- The first load is about 5 KB smaller (brotli, 208 to 203 KB, measured the way `pnpm run quality:report` does): the clock-out
  dialog, the new-task form, the phone pairing panel, the character menu and the sign-in page load when they are first used, and
  `@aether/office-scene` declares that it has no import side effects so unused scene code is dropped from the first chunks.

### Changed (web structure and accessibility)

- A disabled control names its reason to assistive technology as well as in a tooltip: `whyNot` sets `aria-describedby` to a text kept
  in the page by `ReasonDefs`; about sixty buttons and fields that were off with no reason now give one (new `why*` locale keys in both
  languages). `e2e/settings/disabled-reasons.spec.ts` checks the main pages as the owner and as a viewer, with axe.
- `apps/web/src/ui.tsx`, `api.ts` and `localSessions.ts` are split into focused modules (`ui/*`, `api-csrf`, `api-session`, `api-commands`,
  `api-error`, `session-names`, `session-attention`) and every importer names the module it uses; no names or behaviour changed. `useLocale`
  reads the interface language without importing the whole preferences store.
- Every function in `apps/web/src` is under 50 lines, and no web source file is over 400 lines (Terminals, Sessions, Reviews and Composer were split).
- The 3D scene's own words (HUD, key help, tooltips, life log, squad lines, beam readouts) are two tables, `i18n/en.ts` and
  `i18n/zh.ts` in `packages/office-scene`; the type requires every key in both languages and `tests/aether/scene-text.test.ts`
  checks that both say the same values. No inline `zh ? '…' : '…'` pair is left in the web or the scene, so
  `tests/aether/inline-i18n-baseline.json` is empty.

### Fixed (frontend, first use and accessibility)

- First run: with no project, or no character and no session, the office page shows what AETHER does, three steps, the commands to
  copy and `pnpm run doctor`, with "Create a project" as the secondary action; one session in live mode gets a one-line note about
  bubbles and figures (D01).
- The first-visit language follows the browser (`zh*` is Traditional Chinese, otherwise English) for the login page, the
  interface and `<html lang>`; a saved choice is never overridden (D02).
- A project id in the address that is not available falls back to the first project with a short notice, and a missing project
  has no Retry (D04). Unknown pages show "Page not found" with a link home; an unknown Settings group still opens the Settings home, as its test pins (D17).
- The Approvals page lists pending permission requests and its empty text depends on whether Remote approvals is on (D05).
- The tab title is `<page> · AETHER OFFICE` in the interface language (D08).
- Create task, Propose knowledge and the login mark required fields and show their own inline errors instead of the browser's
  bubble; dependencies have a hint; the task version hash is behind "Details" (D13).
- A skip link to the main landmark, a labelled navigation, and an accessible name plus a live text summary for the 3D canvas (D16).
- The layout editor is labelled experimental and docks at the side of the screen (D19).

### Fixed (backend and CLI)

- Claude usage: the parser no longer drops a line whose keys are reordered, whose usage is spaced (`"usage": {`) or whose id follows the usage; the byte fast path stays first (measured on 200 real transcripts: 33,283 of 33,283 messages, identical totals) and a missed assistant line is read by a bounded `JSON.parse`. Lines neither path can read are counted in `scan.skippedLines`, so the existing warning shows them. Rollup version 5.
- A project folder that does not exist, is not a folder or cannot be read is a 400 `PROJECT_ROOT_NOT_FOUND` / `PROJECT_ROOT_INVALID` (explained in both languages) instead of a 500.
- `pnpm run doctor`: a missing Claude Code or Codex CLI is a warning (exit 0), only a missing hard prerequisite fails; a Codex version missing from `compat.json` reads "not verified, probably works" and lists the verified versions; `--strict` makes warnings fail.
- `AETHER_HOME` relocates `~/.aether` (hook scripts, approvals file, hook spool). `pnpm hooks install|remove` prints the files it writes before writing, supports `--dry-run`, and ends with one sentence instead of a stack trace when it cannot write. Tests run under a temporary `AETHER_HOME`.
- `pnpm run pair` tells an unreachable control plane from a rejected owner token (another data directory) and a missing token.
- Settings: the model catalog note says that a stale Codex cache runs `codex debug models` (no model session starts).

### Fixed (e2e regressions after the parallel merge)

- The selected character's name tag no longer hides under a speech bubble (a two-pixel taller bubble from the line-height token was
  enough to cover it in a close-up); the other tags still yield. `panel-consistency.spec.ts` switches live execution back on
  (the emergency stop of `native-workflow.spec.ts` leaves it off) and tolerates an already continued session; a stale
  `@ts-expect-error` that broke `tsc` is removed.

### Changed (UI consistency, track F: responsive layers, preferences, strict lint)

- Top bar: in the native runner the right-hand controls never shrink and the project picker gives way, so language and theme stay on screen at 320 to 1920px (D06, D07); the emergency stop shows its icon only below 1000px and its confirmation opens under the bar on a phone; the link state is a dot below 760px; the telemetry numbers move to the sidebar below 1500px.
- Intro tour caption moves to the top left, clear of the floor readout and KPI plaque (D11). The floor panel's buttons keep their glass look in the light theme, and the phone's attention chip uses the scene gold so it reads in both themes (D12).
- Phone touch targets reach 44px: the brand, hint toggle, KPI chips, floor rail, sidebar and settings links gain the hit area; `.primary` is 44px on touch because its cut corner clips a hit area (D18). The KPI chip strip fades at its right edge.
- `@media` uses only 760/1000/1250 wide and 500 tall (four documented exceptions); narrow-component rules became container queries. The 36px phone override, the duplicate `--tabbar-h` and every `!important` outside the preference blocks are gone.
- `forced-colors`, `prefers-contrast: more` and `prefers-reduced-transparency` are supported (`e2e/settings/preferences.spec.ts`).
- `scripts/check-design-tokens.mjs` holds eight strict rules to `scripts/design-token-baseline.json` (a count may only go down), with the `/* token-lint: <reason> */` escape hatch; the quality scorecard reads the same rules. `e2e/ui/role-variance.spec.ts` no longer excludes any chrome and adds a 44px hit-area check and the native top bar at six widths.

### Added

- UI consistency, tokens and shared controls: a control scale (`--control-h-sm/md/lg` 32/36/40 with a mouse, 36/40/44 on touch,
  switched in one place), `--bar-h`, `--lh-*`, `--shadow-sm/md/lg`, `--dur-slow`, role radii and one focus ring; the shared
  `u-` classes (`u-btn`, `u-field`, `u-chip`, `u-card`, `u-row`, `u-head`, `u-empty`, `u-switch`, `u-segmented`) with the old
  classes as aliases; `e2e/ui/role-variance.spec.ts` caps the distinct heights per control role on 14 views at three sizes.
- A computed quality scorecard: `pnpm run quality` scores ten areas (structure, types and gates, tests, UI tokens, accessibility and
  i18n, performance budgets, docs truth, security, open-source readiness, product maturity) from measurable rules with their exact
  files and lines (`--json`, `--area`, `--target 95`); `quality:report` writes `docs/quality/scorecard.{md,json}` and raises the
  per-area floors in `docs/quality/floors.json`; `quality:check` (in CI after the build) fails on a stale scorecard or an area below
  its floor. The rubric is in `docs/quality/README.md`. No product code or dependency changed.
- UI consistency, 3D scene overlays: the scene toolbar's segments, buttons and select take `--control-h-sm` (32 with a mouse,
  was 30 to 36; the finger-size rule moved out of `touch-targets.css`), the name tag and character menu focus rings use the
  focus tokens, line heights, the HUD transition and the intro dip use `--lh-*` and `--dur-*`, the character menu's shadow is
  `--shadow-md`; `e2e/scene/scene-hud-consistency.spec.ts` checks the toolbar heights at three sizes.
- Licence compliance: `THIRD_PARTY_NOTICES.md` is generated from the lockfile and the installed packages (every shipped
  package with its licence text and NOTICE file) by `pnpm run notices`; `pnpm run notices:check` (in CI) fails on stale notices
  and on an unknown, denied or unapproved licence; `--sbom <file>` writes a CycloneDX 1.5 SBOM. `REUSE.toml`, `LICENSES/` and a
  `NOTICE` file record the licence of every path; `docs/legal` holds the inventory, the licence policy, provenance and trademark
  notes; `scripts/oss/overlap-scan.mjs` looks for code copied from reference projects.
- The production web build carries `LICENSE.txt` and `THIRD_PARTY_NOTICES.txt`, linked from Settings, About, which also states
  the licence and that the project is not affiliated with Anthropic or OpenAI.
- CI also runs `pnpm verification:check`, `pnpm run oss:check` (notices, licences and publishing readiness, after the build), a
  bundle-size budget (`scripts/check-bundle-size.mjs`) and the unit tests on macOS; `pnpm audit:deps` runs in a separate job that
  only reports. `pnpm lint` also rejects bare Node built-ins (`fs`) in the kernel and web code, anything but `zod` in the
  contracts, `better-sqlite3` in the runner, and a committed `.only` or `@ts-ignore` in `scripts`, `tests` and `e2e`.
- `docs/architecture.md` describes how to add a layout `schemaVersion`.
- `e2e/ui/shell-consistency.spec.ts`: the top bar, its project select and sign-out link, the sessions table actions, the Settings
  switch and segmented, the KPI office chips and the active nav link's focus ring keep to the control scale.
- 3D scene, mobile quality (see "Mobile quality" in `docs/design-system.md`): `?msaa=1` / `?msaa=0` overrides the tier's MSAA choice
  so it can be measured on a real phone (the default is unchanged); the soft additive gradients (light shafts, squad beam and zone,
  clouds, holograms, petals, pollen, glass strands) are dithered after the alpha is applied; the planet texture is 1024x512 on a
  phone and on low (GPU estimate 57.3 to 48.0 MB on the phone profile); the phone's high tier renders at pixel ratio 2 (one named
  constant per tier in `perf-control.ts`; **not validated on a real phone**, the default tier is unchanged).
- A lost WebGL context shows a card with "Reload the scene" and "Use the list" instead of silently switching to the list.

### Fixed

- Desktop buttons, icon buttons, selects and the sign-out link are no longer drawn at 17 to 30px (now 32 or 36); the Tasks title
  row keeps its actions together on a tablet; the connect-phone dialog lines up its label, field and timer; the light theme's
  `--dim` differs from `--muted`; `docs/design-system.md` states the real type scale (13px base) instead of 14px.
- A character keeps its desk while it stays in the office. The observed building used to be regenerated most-recent-first on
  every refresh, so any session that wrote made characters jump to other desks (name tags, the camera's target and an open
  action menu followed the wrong character). Desks are now assigned once (`assignSeats`: a new arrival takes the first free slot,
  a departure frees its slot, nobody else moves) and remembered per project in the browser across a reload; a saved layout is
  still never rearranged. The e2e seat fixture no longer needs ordered modification times.
- `AdaptiveRatio` no longer drops an idle phone's pixel ratio from 1.5 to 0.75 within seconds: it judged the 50 ms idle redraw
  against a 33 ms target.
- A hook spool rotation no longer makes every session's hook state, waiting-for-approval badge and subagent squad disappear:
  the reader also reads the end of the rotated `.1` file.
- Behind a reverse proxy on the same machine the hook routes refuse a forwarded request, and `AETHER_TRUST_PROXY` (proxy
  addresses; default none) makes the sign-in limits count the real client and the session cookie `Secure` behind TLS.
- The public GitHub webhook is limited to 120 calls a minute per address and answers an unknown integration id with 401 like a
  bad signature.
- A migration checksum mismatch says which migration and what to do; the `.pre-migration` database copies are mode 0600 and only
  the newest three are kept.
- App shell and pages on the control scale: the top bar is `--bar-h` (56, was 60 on a desktop); its project select, the sign-out
  link and the user dot are 32px; the sessions table's actions are 32px (were 26); the Settings switch and segmented control and
  the KPI header and office chips use `u-switch`, `u-segmented`, `u-head` and `u-chip`; the phone top bar's project name ends in
  an ellipsis (the whole name is its tooltip) instead of being cut; the active nav link and the search box keep the one focus
  ring; the KPI notes under the tiles, a section and the body share one gap (was 4px and 16px); `kpi.css` is split into `kpi.css`
  and `kpi-charts.css`; the login button is `--control-h-lg` and its text line height is `--lh-body` (was 1.9); `60vh` is `60dvh`.

### Changed

- Phone and name-tag performance: the name tag's working shimmer and its amber attention glow no longer repaint (`translate`/
  `opacity` on a pseudo-element instead of `background-position`/`box-shadow`); glass over the 3D canvas has no backdrop blur on
  a phone (`phone-glass.css`, desktop unchanged). Remaining main-thread animations: the thinking line's text shimmer,
  loading skeletons and the desktop floor plaque scan.
- The control database is pruned hourly: events and command receipts after 90 days, runner report ids and webhook delivery ids
  after 30 days, expired browser sessions (see Data retention in `docs/security.md`). The once-a-second message-wait pass no longer
  takes the write lock when no wait is open.
- One definition of when a session counts as working (two minutes) and when one with no process is gone (ten): the server's
  liveness, the child-rollout window and the web app's activity all read the constants in `@aether/contracts`. One
  `formatSpan`/`formatAgo`/`DAY_MS` in the kernel replace the duplicated relative-time helpers (the feed now says "just now"
  instead of "now" in English). The kernel, providers and control services no longer import each other in cycles.
- Per-seed memos in the office scene are bounded and the terminal send queue forgets drained terminals, so a long-lived tab does
  not grow with every session it has seen.
- A viewer sees why write actions are off (tooltip); the Reduce motion help text now states how it relates to the automatic
  camera and Calm mode, and that it takes the system setting only the first time. A test fails when a file gains an inline
  bilingual string beyond `tests/aether/inline-i18n-baseline.json`.
- Removed the two exports nothing referenced (`clearMoments`, the `SpritePool` type).

- The provider marks are small decorative provider indicators: Codex's mark is tinted to the muted text color instead of a
  brand color (`--provider-codex` is gone), the SVG is `aria-hidden` and the provider's name is its tooltip and a visually
  hidden text. `docs/legal/trademarks.md` states they are never used as branding.
- Every workspace package declares the MIT licence; the CI actions are pinned to commit SHAs.
- The product version is written once, in the root `package.json`: health, the A2A card, MCP and ACP client info read it from
  `APP_VERSION` in `@aether/contracts`, and a test fails when a workspace `package.json` differs.
- Every verification-ledger blocker has its own text (a test rejects a pasted one); SEC-06 and ENV-05 no longer say that no
  Markdown renderer exists or that only macOS was run. Documentation names the upstream projects instead of the untracked
  `.research/` folder and states the real Git timeouts and the effect of a same-host reverse proxy.
- Tests wait for conditions instead of sleeps where a positive condition exists, and the last fixed test ports are ephemeral.
- UI consistency, session panel (track E): the model chip, the quick replies, the squad strip chips and the relation chip are
  `u-chip`; Send and the text box take `--control-h-md`; the panel, feed, transcript and composer use `--lh-*` instead of
  literal line heights, `--dur-fast`, `--shadow-md` and the one focus ring (the resize handle's grip, the squad tree rows and
  a focused turn included); the other panel controls read `--control-h-sm/lg` instead of the older touch sizes (the squad chip
  and relation chip stay 44px on a finger because they sit in a scroller). `e2e/ui/panel-consistency.spec.ts` checks chip
  heights, Send against the box and the absence of nested vertical scrollers in the panel at three sizes.
- Control and runner restructure (no behaviour change): every function in `apps/control/src` and `apps/runner/src` is at most 50
  lines (`Control.execute` dispatches through one typed handler table, `changeWork`, the MCP server, the observer, the local
  routes, the usage tracker and the runner loop are split into named steps), the runner and start-up banner write through one
  tiny `stdio` helper instead of `console`, and non-null assertions, double casts and unused exports in those folders are gone.
  Three tests no longer sleep for a fixed time.
- Quality convergence (structure and types): the release kit (`scripts/oss`) and the documentation screenshots script are split
  into modules by concern with their entry points, `pnpm run` names and flags unchanged; the HTML neutralizer, the inline Markdown
  reader, the path finder, the Claude, Codex and ACP adapters, the demo fixture runner and `setup` are small named steps
  instead of long functions; indexed reads are narrowed instead of asserted; exports nothing imports are no longer exported;
  the end-to-end specs are type-checked (`tsconfig.json` includes `e2e/` and `playwright.config.ts`) with `noImplicitReturns` and
  `noFallthroughCasesInSwitch` on. The docs use reserved example hosts (`office.example`, `192.0.2.20`).
  `@aether/kernel` is marked side-effect free like `@aether/contracts`, and the contract response shapes that only served as
  types (`ClaudeLimits`, `ModelCatalog`, `FileReservation`, `ReviewComments`, `Room`, `Workflow`) are plain types.
- The stop-session and clock-out API tests, and one scene-context spec, wait for the process or the frames they need instead of a fixed sleep.
- The 3D scene package is restructured with no change to what is drawn: `OfficeScene` is a model hook plus a canvas and an overlay
  component, camera control is split into floor, director, take-over and aim hooks, and the member, squad, spire, intro and life
  layers are cut along their hook and presentation seams. No `eslint-disable`, `as unknown as` or dead export is left in the
  package (hooks keyed by value use `use-by-value.ts`; the desk dimensions are typed once in `seating.ts`), and draw calls, shader
  programs, GPU memory and CPU time per frame measure the same on a real GPU. New characterization tests cover the extracted
  helpers.
- The web app: `App`, the pages and the long components are split into container hooks and small presentational parts (no function
  over 50 lines remains in `apps/web` except the few the quality scorecard lists); the `en` and `zh` locale tables are per-domain
  modules under `locales/en/` and `locales/zh/` behind the same exports; the exhaustive-deps suppressions are replaced by a
  `useLatest` ref; the shared project select, quality select, command runner, form check and confirm buttons replace the
  duplicated blocks. Small differences: a terminal-start error shows under the start form, and a task's "resume session" box and the
  propose-knowledge form's errors reset when their dialog reopens.

### Fixed

- Usage readings say what they cover. The KPI dashboard shows "Not placed in an office" (what the office tabs, which hold running
  and the newest 60 sessions, leave out, so offices plus it equal the building) and an unknown office is empty, never the
  building's numbers. The scan reports `truncated` with the real file count (the oldest transcripts are the ones left out; Claude's
  project folders are visited newest first; the cap is 8192 files, was 4000), unreadable files and skipped lines, and a server
  that sends no scan is no longer taken as complete. "Active time" is now "Session time" (sessions' minutes added up, which can
  exceed the clock). Rate-limit rings show the age of their reading, mark a stale one, and use the usage time zone. Model shares
  are of the scope total ("unknown" reads "Not recorded"). Git KPIs flag a capped commit list or line count, say how many
  projects the building figure leaves out, count authors by email and follow the usage time zone.
- A session whose last turn is `<synthetic>` (an API error) no longer shows 0% context and the model `<synthetic>`: the last real
  turn is used, or nothing. Such turns are not counted as requests. The context gauge's tooltip says when the window is an
  assumed 200k or an inferred 1M.
- A Claude message that appears in two transcripts (a resumed session) or twice apart in one is counted once (0.27% of fresh
  tokens on one real history); a Codex subagent's rollout counts as part of its parent session (and its office). A file replaced
  in place with the same start and a larger size is read again, not taken as an append. The session list's spend and the KPI use
  one parser. The parser no longer searches the whole chunk for tool calls on every message (a cold scan of 8 GB went from
  about 11 s to about 7.5 s).
- Concurrent requests share one local-session scan (it ran once per request), and its cache is keyed by home and spool file.
  The file list, the commit graph and the session scan run git through the one hardened wrapper (`core.fsmonitor=false`,
  `GIT_OPTIONAL_LOCKS=0`).
- A reply ending in a lone backslash that also held HTML or an entity made the HTML neutralizer throw (the chat showed an error instead of the message); the backslash is now kept as text.

### Changed (quality convergence, backend and packages)

- `GET /health` is rate-limited per address (120 calls a minute, then 429, the webhook's limit); it is the one public route that had none. The three approval-hook routes now name their credential (the hook's bearer token) in `docs/security.md` and in the `PUBLIC_ROUTES` table.
- Behaviour-preserving refactors: the markdown block parser, the doctor checks and the usage parser (now counters, Claude and Codex readers) are split into functions and modules under 50 lines and 400 lines; the pair CLI writes through the stdio helpers; no non-null assertions remain in the control, runner, kernel, contracts, providers or scripts sources; five large test files are split by topic.

### Changed (first-load JavaScript)

- First-load JavaScript and CSS of the web page, as transferred (what the scorer's `first-load` rule counts), fell from 251 KB to
  186 KB brotli (budget 200 KB). Only the language in use is downloaded (`loadLocale` in `i18n.ts`; `main.tsx` waits for it before
  the first render, and a language change waits for its table, so no key flashes); the zod runtime no longer reaches the entry
  (`local-session-compat.ts` fills a stale subagent with plain defaults, and the session limits live in
  `contracts/src/session-limits.ts`, apart from the schemas); the conversation panel's content (feed, transcript, Markdown) is a
  lazy chunk behind a header that is there at once, fetched when the page is idle; the page-level Suspense fallbacks show the
  loading screen instead of nothing. The page's own language table (16 to 18 KB brotli) and, on a desktop, the panel chunk (18 KB)
  come on top of the 186 KB.
- `scripts/check-bundle-size.mjs` budgets ratcheted: total 1000 to 870 KB gzip, largest chunk 450 to 400 KB.
- Tests that render text get both language tables from `tests/aether/setup-locales.ts`; `en` and `zh` are no longer exported by `i18n.ts`.

### Changed (office-scene, types and structure)

- `packages/office-scene` has no non-null assertion left (241 before; the repository's 324 are now 83) and no function over 50
  lines (81 before): long components, hooks and drawing functions are short ones that call named parts, props types are hoisted
  above their component, and `flower-bloom.ts` is split with `flower-petals.ts`. Indexed reads whose index is already proven go
  through `checked.ts` (`itemAt`, `lastOf`, `valueOf`) and fail with a `RangeError` instead of handing back `undefined`; a
  string-table or loop that can narrow does so (`?? ''`, `entries()`, `pick`). No behaviour change: a seeded characterization
  test (`scene-characterization.test.ts`: 400 genomes, 14 spires with their gardens, 300 shots, feeds and camera poses, 300
  squad steps, layouts, floors, desk items, every desk-screen view and the life scheduler) keeps the digests taken from the code
  before, and the scene's Playwright specs pass unchanged.
- `random.ts` (41 importers) is split into `hash.ts` (`hashText`), `seeded.ts` (`seeded`, `Rng`), `pick.ts` (`pick`, `weighted`,
  `between`) and `screen-seed.ts` (the per-member streams of the desk screens); every importer names the module it uses.
  `pick` and `weighted` now throw a `RangeError` on an empty list or all-zero weights (they crashed there already, later).
- The puppet-string simulation (`squad/puppet/verlet.ts`, the per-frame hot loop) reads its typed arrays through one local
  `read` (0 for a stray index) instead of 51 `!`. Measured against the code it replaced on a real GPU (Apple M4, Chrome, 1440x900,
  balanced, interleaved A/B, same data): desktop jsMs median 1.6 and 1.6, phone 1.6 and 1.6 (8 rounds, new first on half of
  them), the squad scene (`squad=8&tools=900`) 3.9 and 4.0; draws, programs, GPU MB and triangles identical. A micro-benchmark of
  `stepStrings` (60 strings, 41 interleaved rounds) gave 391 ms and 374 ms at the 10th percentile.
- Web JavaScript is about 4 KB gzip larger in total (816 to 820 KB, all of it in the lazily loaded scene chunk: the extra function
  boundaries); the first load is unchanged (251.4 to 251.3 KB transferred): `emotes.ts` is a table typed by id (a missing emote is
  a type error, and `emoteOf` needs no lookup), and `layout.ts` builds a floor's objects through one `place` helper.

## [0.4.0] - 2026-10-07

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

### Added

**Watch: the session panel and live updates**

- A panel beside the 3D office (a bottom sheet on a phone): a feed of every observed session in four groups (needs you, working,
  recently finished, idle) with the newest reply, the running tool or what it waits for, and an unread dot; choosing a session
  opens its conversation. Resizable between 320 and 720 px, foldable to a rail.
- `GET /api/local-sessions/stream`, a bounded server-sent change stream fed by one shared watcher (names the session and the
  kind of change, never content), replacing most polling; the top bar shows live, connecting, reconnecting or offline. ETag and
  `304` for the heavy reads.
- Context-window gauge and compaction effect at each desk; Claude and Codex marks on name tags, desk screens and feed rows.
- A control-room wall of up to four live views that follow the other busy members, a calmer automatic camera, and name tags
  redesigned as small glass chips.
- Desk screens that look like the work being done (editor, terminal, browser, test runner, commit graph, ...) from the real
  recent files, command heads and hosts; real facts stay real and nothing claims an outcome.
- Speech bubbles over working members with the latest prompt and reply, rendered as Markdown.
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
  any error Claude asks in its terminal as usual. Owner and operator only, audited.
- Notifications (on by default) for a session that needs you, a waiting approval and a long turn that ended while the tab was hidden.
  They carry the project name only.

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

**Phone, PWA and settings**

- "Open on your phone" with a one-time QR code (also printed at start when `AETHER_HOST` is set, and by `pnpm run pair`); a paired
  phone is remembered for 30 days. A full-screen 3D phone layout.
- An installable app: manifest, icons, shortcuts to Sessions and Approvals, install button and iOS steps, and a service worker
  (secure contexts only, never caches API answers, asks before updating, `?sw=off` to remove it).
- Settings rebuilt as eight groups (General, Notifications & approvals, Connections, Models & execution, Office, Advanced, Data &
  privacy, About) with search (`/`), real state in every row (permission, secure context, which CLI was read), a **System** theme,
  and Undo for risky switches.
- Navigation for CLI users: office, sessions, approvals, terminals, history and settings; everything else behind **Advanced features**.

**Execution, interoperability and foundations**

- Control plane (Fastify, SQLite) with roles, idempotent commands, an event log, tasks, messages, rooms, reviews, approvals,
  schedules, knowledge review, skills, integrations, an A2A gateway, backups and a typed HTTP API.
- An independent runner: Git worktrees, Codex and Claude native execution, MCP tools, interactive terminals, read-only observation,
  verifiers and a durable journal. Hooks for Claude Code and Codex.
- Eight animal characters, a ghost and a jiangshi, generated by a Blender pipeline with a desk-and-chair clipping audit.
- A responsive React workbench for desktop, tablet and phone with a token-based design system and a lint that enforces it.
- A verification ledger and generated report; `pnpm run doctor`; Claude subscription limits in the top bar.
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
  desks, as before).
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
- Little decorative moments in the 3D office, each from a real signal and never claiming a result: a rubber duck while the
  model thinks, a test lamp and a bug while a test command runs, a swirling disc while packages install, a rocket on a `git push`
  command ("started", not "pushed": no outcome is known), a pager bell on an error, steam after hours of work, a loop ring for a
  command repeated again and again, copy-and-paste keycaps for a Stack Overflow fetch, a `:q!` sign for vim, a pile of boxes for
  many uncommitted files, a stand-up circle when several members are idle, and confetti for the Konami code. One draw call
  and one shader program for all of them. A member gets one at a time, a floor two, the building three in a minute; each has a
  cooldown and a seeded chance, so it does not feel busy. A hidden polite log announces each in English or Traditional Chinese.
  **Settings → Office** gains Calm mode (on by default when the system asks for reduced motion; also in the drawer), switches for
  eight kinds, the meme frequency and the intro tour. The stored preferences are versioned (1) and migrated.
  The context-compaction effect now follows the Work switch and Calm mode.
- **Office life, wave 2.** Fourteen more moments, each from a real signal and each decorative: a green lamp and a squashed bug
  when a test command exited successfully, a red lamp and a scurrying bug when it failed, a CI stack for a watch command's
  exit status, a red squiggle for a failed build or typecheck, a rocket (now from a push that exited successfully), danger stripes
  for a force push, a tug-of-war for merge conflicts, a launch pad for a deploy and a Friday sign for one on a Friday afternoon, a
  bandaged skull gag for `rm -rf`, `sudo` and `curl | sh` chips, "works on my machine", "not a bug, a feature" and an LGTM stamp
  for a real PR approval. An outcome moment starts only when the provider stated how the command ended; unknown means nothing
  shows. 404 and 418 are not built (no real data). **Settings → Office → Animations** gains **Replay intro**, and a member's
  conversation gains a closed "Recent moments" fold.
- **The squad beam follows tokens.** Its brightness reads the subagents' tokens per minute (Claude transcripts) and falls back to
  tool calls per minute, on a smooth saturating curve; the zone label's tooltip and accessible name say which ("~12K tokens/min
  (based on tokens)" or "~8 tool calls/min (based on tool calls)").
- **Squads in the 3D office.** A subagent no longer takes a desk across the room from its parent: it sits in a pod of a squad
  zone beside the supervisor's desk (a floor too full for a zone keeps desks for its subagents, as before). A new subagent walks
  in from the elevator core and sits down, a finished or vanished one stands, waves and walks back into the core, seats never
  move under someone who is sitting and the zone shrinks only after ten quiet seconds. A funnel of light runs from the zone into
  the core and a thin filament on to a halo over the supervisor, brighter the more tool calls per minute the squad makes; the
  supervisor's desk gets an in-tray, a stamp and a gold edge. Each zone has a label button ("Squad of main, 3 working") that
  flies the camera there, and the office's one screen-reader log ("Office activity", shared with the little moments, one line per 5 s) announces who joined and who left. Calm mode and the low tier keep the beam
  still and drop the halo, the filament and the drifting points; reduced motion shows the same changes without walks.
  `?squad=N` (with `arrive`, `leave`, `tools`, `look`) previews it with stand-in subagents.
- **Puppet strings and the hand-over of a result.** Thin strings of light run from a control cross over each working subagent
  to its head and hands (tied to the character's own head and hand sockets): they tighten and jerk on every tool call, go slack
  when it rests and are frozen with an amber cross while it waits for a permission. They are off on the low tier, with the
  relation effects and with their own switch (**Settings → Office → Puppet strings**), and still in Calm mode and with reduced
  motion. When a subagent finishes it now stands, walks a folder to its supervisor's desk and puts it in the in-tray; the
  supervisor reads and nods and a stamp reads **RECEIVED** (a receipt that a result came back, never an approval), or a grey
  **RETURNED** when the result is flagged as an error (no red or green). At most two carriers walk per floor, one stamp at a time
  per desk; the low tier and a desk out of view show the folder popping into the tray, Calm mode and reduced motion just show
  it. The log says "{type} handed over its result". `&result=error`, `&strings=0` and `&handover=0` join the `?squad=N`
  preview.
- **Characters gesture with the office's little moments.** One pose registry decides what a member does when something asks it to:
  the person's emote outranks a hand-over's nod, which outranks a life effect's gesture; a pose still playing is only taken over by
  a higher one, a life gesture does not repeat on the same member within 30 s (or any within 8 s), and reduced motion plays none.
  The rubber duck makes the member turn to it, a passing test nods, a failing test, a failed build and a Friday deploy shrug, the
  stand-up circle stretches and the Konami code makes the desks in view celebrate. This also fixes a hand-over's nod being hidden for
  good from a supervisor the person had once made wave. New moments: **R21**, a time-machine swirl when a hard reset starts (high
  quality only; it says it started, never that it worked), and **R43**, sticky notes when a search for TODOs starts.
- **The squad beam's brightness is calibrated on real work.** The reference rates were chosen; they are now 24 tool calls and
  8,000,000 tokens a minute, set from the per-minute distribution of this machine's own Claude subagent and Codex transcripts
  (`scripts/beam-calibration.ts`, read-only, numbers only). A squad's median working minute reads about 0.7 on tool calls (0.94 for
  the busiest 1%); with the old 20,000 tokens every active minute glowed the same. The method, the numbers and why tokens cannot
  have both a median of 0.5-0.7 and a p99 of 0.95 on a logarithmic curve are in the design notes; a test pins the constants to them.

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
  8-stop room tour is renamed "Guided tour (rooms)". `e2e/office-life/intro-perf.spec.ts` (`PERF_GPU=1`) measures its frames.
- `scripts/contact-sheet.mjs` renders the scene's views (and, later, each office-life effect at fixed times through
  `?preview=life&effect=<id>&t=<ms>`) into one labelled sheet per category for a visual review, and
  `e2e/office-life/office-life-perf.spec.ts` (`PERF_GPU=1`) measures a baseline against a variant scene on a real GPU, interleaved and
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

- The squad and life layers do less per frame: a mesh is uploaded only when what it holds changed, the beam no longer allocates per
  frame, an idle hand-over layer looks once a second, and the squad's shader programs are linked while the scene loads, so the first
  subagent to appear no longer causes a hitch. Measured on the real GPU (Apple M4) with 20 members, 8 subagents and six looping
  effects at high and balanced quality and on a phone profile at 4x CPU throttle: 60 Hz held in every case, the squad layers at about
  0.08 ms of CPU a frame (was 0.10) and the six effects at 0.03; the numbers and the open items (the characters' own first-appearance
  compile on a throttled phone) are in the design notes. `scripts/perf-matrix.mjs` repeats the measurement; `&loop=1` plays a life
  preview on, and `&after=MS` delays a squad's first appearance.
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
- Phone performance: the first-load script no longer includes zod (218 to 187 KB gzip) and the 3D scene stops drawing while the
  full-height sheet covers it.

### Fixed

- A browser that came back after its tab was closed (or after iOS discarded it) looked signed in but had every write refused with
  `CSRF_REQUIRED`. The page now asks `POST /api/session/csrf` for a new token and retries once; project adoption retries a failed
  attempt instead of giving up.
- The KPI numbers follow a session that starts or grows (the usage scan waits out a short gap and the page refetches when a
  transcript moves).
- A running session's row no longer says "No reply yet" for a session that has only just appeared, and a finished session no
  longer claims it has no reply.
- A page left open across a rebuild no longer goes blank: a chunk that cannot load reloads the page once, and any other render
  error shows a Reload button.
- A runner started before it is enrolled prints how to enroll instead of a stack trace; the terminals and approvals pages say how
  to get profiles and prompts into them; common errors are worded in both languages instead of raw codes.
- Members beyond a floor's 48 desks take a desk on the next floor with room instead of vanishing; "Show in office" brings the
  camera to the member on a phone too.
- Scene fixes: close-up camera shots push in, members sent home walk with planted feet, pointing at the crown works, the
  control-room wall no longer disappears at 1440x900 or goes black when its members change, a name tag no longer draws over a
  speech bubble, and office chairs no longer flicker.

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

### Removed

- The upstream agent-office application; its attribution is kept in `THIRD_PARTY_NOTICES.md`.

[Unreleased]: https://github.com/haotool/aether-office/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/haotool/aether-office/releases/tag/v0.4.0
