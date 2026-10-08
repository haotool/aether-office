# Mobile performance measurement (Phase 4 harness)

This document describes how AETHER OFFICE measures **relative** mobile PWA performance for A/B experiments. It does not change product behavior. Formal baselines are run by the audit PM in an exclusive window; developers use the same harness locally.

See also [design-system.md](../design-system.md) (performance section), [mobile-gradient-perf.md](../research/mobile-gradient-perf.md) (research), and `scripts/perf-matrix.mjs` (scene GPU matrix).

## Profiles

| Profile | Viewport | DPR | CPU throttle | Network | Notes |
| --- | --- | --- | --- | --- | --- |
| **M-LAB** | 390×844 touch | 3 | optional | none | Mac Chrome + Metal ANGLE; headless refuses software renderers |
| **M-MID** | 390×844 touch | 3 | 4× | LAN dev/built server | Default for Phase 4 A/B |
| **M-LOW** | same as M-MID | 3 | 6× | Slow 4G (CDP) | M-MID + heavier CPU + network |
| **M-REAL** | device native | device | — | real radio | G5 field JSON via `?fieldperf=1` (human) |

**Slow 4G (CDP)** uses Chrome DevTools `Network.emulateNetworkConditions` values from `Slow4GConditions` in [NetworkManager.ts](https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/core/sdk/NetworkManager.ts): `latency` 562.5 ms, `downloadThroughput` 180000 B/s (~1.6 Mbps×0.9), `uploadThroughput` 84375 B/s (~750 Kbps×0.9). Implemented in `scripts/mobile-perf/network.ts` and `node --import tsx scripts/perf-matrix.mjs --network slow-4g`.

## Harness entry

```bash
pnpm run perf:mobile -- \
  --url-a http://127.0.0.1:4798 --token-a .data/perf-a.json \
  --url-b http://127.0.0.1:4799 --token-b .data/perf-b.json \
  --rounds 12 --out evidence/audit/my-run
```

- **Interleaved** order per round: A, B, A, B… (round index reverses case order on odd rounds).
- **Discard round 0** before medians (shader/cache warm-up).
- **`--aa`**: point B at the same URL/token as A to measure noise (`noiseFloor` in output).
- **Load discipline**: before each case, 1-minute load average must be ≤2 (`uptime`); otherwise wait up to `--load-wait-min` (default 5). Failing rounds are tagged `invalid:load` and **excluded** from aggregates.

### Built servers (A vs B)

Build each worktree once (`pnpm build`). Start **production** control+runner on allowed ports (4798–4799 for audit agents; never 3000, 3001, 4310, 4320, 4330):

```bash
export AETHER_LOCAL_SESSIONS_HOME="$(mktemp -d)"
node --import tsx scripts/mobile-perf/serve-built.ts --port 4798 --token-out .data/perf-a.json
# In another worktree / terminal:
node --import tsx scripts/mobile-perf/serve-built.ts --port 4799 --token-out .data/perf-b.json
```

- **A** = integration branch worktree (baseline build).
- **B** = candidate branch worktree (experiment build).
- Stop servers with Ctrl+C; confirm no stray `node apps/control/dist/main.js` processes remain.

Heavy commands (`pnpm build`, full test, harness runs) must use the audit lock wrapper from the main checkout path: `../aether-office-audit/integration/evidence/audit/with-lock.sh p4-0-perf-harness …`.

## Output schema (`aether-audit-perf-run/1`)

`summary.json` includes:

- `env` — Node, Chromium, git HEAD, throttle, viewport, renderer name, load sample
- `rounds[]` — raw per-round metrics (`renderMsP95`, `jsMsP95`, draws, triangles, gpuMB, `/api` count/rate, long tasks, cold-start response bytes)
- `cases` — per-case median and p95-of-p95
- `delta.BvsA` — positive median delta = B improved vs A
- `noiseFloor` — when `--aa`
- `pass` — rule evaluation (thresholds passed via CLI/config, not hard-coded in product code)

A human-readable `summary.md` is written beside the JSON.

## Pass / revert rules (harness-only)

Configurable thresholds (defaults mirror AMENDMENTS A4.3 decorative 3D CUT):

- Δ `renderMsP95` median ≥ 2.0 ms **or** (Δ draws ≥ 8 **and** Δ renderMsP95 ≥ 1.0 ms)
- `jsMsP95` regression ≤ 0.3 ms
- Desktop **B9**: candidate renderMs p95-of-p95 ≤ baseline +5% (when desktop samples are supplied)
- General: median improvement ≥ configured minimum and p95 not worse than 5% of baseline p95

Functions live in `scripts/mobile-perf/stats.ts` with unit tests in `tests/aether/mobile-perf-stats.test.ts`.

## Interpreting results

- M-MID can **rank** A/B changes on this Mac; it cannot prove absolute “smooth on phones” (no Safari compositor, no thermals/jetsam).
- Headless Chrome with `--use-angle=metal` **refuses** SwiftShader/software renderers (same rule as `perf-matrix.mjs`).
- 4× CPU throttle slows the main thread; it does not emulate mobile GPU fill-rate.
- Do not mix cold-start hitch windows with steady-state probe samples.

## Capture a field report on your phone (G5)

Use **`?fieldperf=1`** (not `?perf=N`, which only enables the scene probe rig).

### iPhone (Safari or Home Screen PWA)

1. On the same Wi‑Fi as your Mac, open the demo URL (from `pnpm start` / serve script).
2. Sign in and reach the office.
3. Append `?fieldperf=1` (or `&fieldperf=1` if the URL already has query params).
4. Wait until the floating **Performance report** panel shows **Ready to copy** (~1–2 minutes; do not lock the screen).
5. Use the app for ~2 minutes (change floor, open a character, scroll feed, open/close a sheet).
6. Tap **Copy report**. Paste the JSON into your audit evidence file.
7. Optional PWA: Share → **Add to Home Screen**, launch from the icon, add `fieldperf=1` again, repeat for ~1 minute.

### Android (Chrome)

Same URL with `?fieldperf=1`. If clipboard is blocked, use **Select all and copy** in the manual text area (`FieldPerfManualCopy`).

With the Chinese interface the same three labels are the `fieldPerfReady`, `fieldPerfCopy` and `fieldPerfCopyManual` strings in `apps/web/src/locales/zh/shell.ts`.

Validate `schema === "aether-field-perf/1"` before filing evidence.

## Known limits

- Mac Chrome ≠ iOS Safari WebGL/compositing (`backdrop-filter` over canvas is under-estimated here).
- No automated B10 thermal/jetsam; long soak needs real devices.
- M-LOW requires `--network slow-4g` (or profile M-LOW in the harness); LAN-only runs are not M-LOW.
