# AETHER OFFICE

- Full scope: `docs/MASTER_SPEC.md`; active decisions: `docs/decisions/`.
- Latest user instruction supersedes the historical 0.3 input requirement: start from a freshly verified open-source clone. Work independently; do not delegate.
- Upstream AgentSystemLabs/agent-office is MIT; retain attribution. Its former CLAUDE publishing instructions do not authorize remote changes.
- No paid model runs, push, remote PR, auto-merge, global configuration edits, or permission bypass without explicit authorization.
- Protect user data. Demo, fixtures, observed, replay and live evidence stay distinct.
- Target: apps/{control,runner,web,cli}, packages/{contracts,kernel,providers,office-scene}. Kernel has no transport/DB/UI dependencies. Runner never writes the canonical control DB.
- Track implementation and verification separately in `docs/FEATURES.json`; log actual checks under `evidence/`.
- Current upstream baseline: `npm test`, `npm run typecheck`, `npm run build`. New workspace commands become authoritative only once implemented.
- Before ending an iteration update `docs/PROGRESS.md` with exact next actions and failures. Never claim production readiness from build success.

## UI rules

Checked by `e2e/responsive.spec.ts` (every page at 320, 390, 820 and 1280 px; a phone on its side) and `e2e/ui-sweep.spec.ts` (axe, both themes). A UI change is not done until both pass and the changed pages have been looked at on a phone-sized and a tablet-sized screen.

1. **Width.** Phone is `<= 760px` or a phone on its side (`pointer: coarse` and `max-height: 500px`); there navigation is a drawer, the inspector a bottom sheet. Nothing scrolls the page sideways. A table that is wide on purpose scrolls inside `.table-scroll`; a table of rows becomes cards on a phone (`table.stack`, a `data-label` on every cell).
2. **Type.** No visible text under 11px (`--fs-label`, uppercase tags only); readable text is 12px or more (`--fs-small`); body 14px and form fields 16px on a phone (iOS zooms the page on anything smaller). Sizes come from the tokens in `tokens.css`, not literals.
3. **Targets.** With a finger every control is 44×44 (`--target-touch`; a checkbox through its 44px row), with a mouse at least 32. Overlays that duplicate another way to do the same thing (the name tags on the 3D scene) are exempt. Hover styles live under `@media (hover: hover)` (a tap must not leave a control looking hovered), and a control keeps `touch-action: manipulation`.
4. **Screen.** `100dvh`, never `100vh`; padding from `--safe-*` for the notch and home bar.
5. **3D.** Works by touch and fits a portrait screen (`fittedOffset`). On a phone the scene _is_ the page: it fills the screen between a slim top bar and the tab bar, with no heading, stats or panels over or above it; the only things drawn over it are a floor rail, a few round buttons, one chip and (for the member in hand) one slim bar. Names are hidden until asked for. Lighter rendering on a phone (no shadows, no antialiasing, pixel ratio ≤ 1.5, smaller models, about 20 frames a second when idle). The 2D list is always one tap away.
   5b. **Text over the scene.** Dialogs and sheets put what you act on first and fold the explanations (`Fold`, `Hint`, `Clamp`): a page's subtitle is an "i" on a phone, a task's diagnostics and acceptance are folded, long results show three lines. Sheets stand on the screen's lower half (56dvh; the inspector 54dvh, 88dvh on request) and are rendered into `document.body` so nothing from the scene overlays them. Name tags are one short line.
   5c. **The camera runs itself.** The director (`director.ts`, `shot-camera.ts`) cuts to who is talking (two-shot with an arc between them), who waits on a person or is in error, who works, and who wants a person (forgotten, ownerless, zombies), and sweeps a floor when nothing is going on. A touch, a chosen member or a focus request hands the camera to the person; after a quiet spell (10 s on a phone, 30 s elsewhere) it takes it back, but never while a member is chosen. Off under browser automation (`navigator.webdriver`) so a test can hit a target that holds still.
   5a. **Load.** Text and model files are served pre-compressed (the build writes `.gz`/`.br`), hashed assets are `immutable`, JSON answers are gzipped, and polling backs off when the event stream is up. A page's first load on a phone stays under 1 MB.
6. **Plain HTTP on the network.** A phone reaching the server over the LAN has no secure context: no `crypto.randomUUID`, `navigator.clipboard` or service worker without a fallback (`browser-compat.ts`).
7. **Cut off.** Nothing is clipped by an ancestor that does not scroll: a short screen (an iPad on its side) still reaches the last link and the sign-out button, and a label never wraps letter by letter. The spec checks this at six sizes, including 1194×834 and 1366×620.
8. **iOS.** `e2e/touch-flow.spec.ts` does the real flow with taps (sign in, task, assign, message, inspect, sign out). `AETHER_WEBKIT=1 pnpm exec playwright test --project=webkit-iphone` runs it and the responsive spec in WebKit, the engine of every iOS browser, once `playwright install webkit` has been run. Added to the home screen the app opens full screen (`apple-mobile-web-app-*`, `apple-touch-icon`).
9. **Process.** Audit on real data at the four widths, fix, run the two specs, look at the screens, then commit.
