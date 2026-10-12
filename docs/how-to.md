# How-to guides

Short answers to specific jobs. Each one gives the command and points to the page that explains it. If you are new, start
with [Getting started](getting-started.md).

## Run it

- **Try it with fixture data and no sessions of your own:** `pnpm demo`
  ([Try the demo](getting-started.md#try-the-demo)).
- **See my own Claude Code and Codex sessions:** `pnpm dev`, or `pnpm build && pnpm start` for the built app
  ([Live mode](getting-started.md#live-mode-see-your-own-sessions)).
- **Move the port or the data directory:** set `PORT` and `AETHER_DATA_DIR` ([Configuration](configuration.md)).
- **Check that the machine is ready:** `pnpm run doctor` (`--strict` also fails on warnings).
- **Back up or restore the data:** `pnpm backup`.
- **Start over, or remove everything AETHER wrote:** stop the server; run `pnpm hooks remove --project /path/to/repo` for
  each repository you installed hooks in (a pristine copy of the settings file stays beside it as `*.aether-backup`;
  delete it if you do not need it); delete the data directory (`.data/<mode>`, or `AETHER_DATA_DIR`: the database, the
  owner token and the journals) and `~/.aether` (the hook spool and, with remote approvals, their key); clear the site
  data of the page in each browser (`?sw=off` unregisters the service worker). Discovery only reads `~/.claude` and
  `~/.codex`.

## Connect things

- **Get exact "working" and "waiting" states:** `pnpm hooks install --project /path/to/repo`; `status` and `remove` undo and
  check it ([Hooks](getting-started.md#exact-activity-with-hooks-optional)).
- **Answer Claude Code permission prompts from the browser or a phone:** `pnpm hooks install --remote-approvals --project
  /path/to/repo` ([Approvals](getting-started.md#answer-claude-code-permission-prompts-from-the-browser-optional)).
- **Open it on a phone:** start with `AETHER_HOST=0.0.0.0 pnpm start`, then `pnpm run pair` prints a QR code
  ([QR pairing](getting-started.md#connect-a-phone-by-scanning-a-qr-code)); HTTPS and the installable app are in
  [Install it on a phone](getting-started.md#install-it-on-a-phone).
- **Start the optional runner for managed agents and terminals:** `pnpm runner` after `pnpm runner:enroll`
  ([Native execution](native-execution.md)).

## Work on the code

- **Run every check CI runs:** `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build` and
  `pnpm exec playwright test` ([Development](development.md)).
- **Format a file:** `pnpm exec prettier --write <file>`.
- **Regenerate the Codex protocol types:** `pnpm run protocol:regen` (add `-- --check` to report drift)
  ([Provider compatibility](provider-compatibility.md)).
- **Retake the README screenshots:** `node --import tsx scripts/docs-screenshots.mjs --port 4511`
  ([Screenshots](images/README.md)).
- **Measure mobile performance:** `pnpm run perf:mobile` for an A/B comparison on an idle machine
  ([Mobile performance](quality/mobile-perf.md)).
- **See the quality scorecard:** `pnpm run quality`; `pnpm run quality:report` rewrites it.

## Release

- **Scan the tree before publishing:** `pnpm run oss:check`; add `--history` to scan the whole history
  ([Publishing checklist](release/publishing-checklist.md)).
- **Produce the notices and the software bill of materials:** `pnpm run notices`, then
  `node scripts/oss/third-party-notices.mjs --sbom <file>` ([Legal](legal/README.md)).
- **Report a vulnerability:** see [SECURITY.md](../.github/SECURITY.md).
