# Dependency audit

The workspace pins direct runtime and development dependencies in each package manifest and `pnpm-lock.yaml`. The initial registry inspection is recorded in `evidence/dependency-registry.json`; it is a dated record, not a claim that every dependency remains the latest release. Project runtime is the checksum-verified Node 24.21.0 installation and pnpm 12.8.1.

## Terminal additions — 2026-10-01

- `node-pty` 1.1.0 was already pinned in `apps/runner/package.json`. Inspected its installed typings, UNIX implementation and installation scripts alongside the [Microsoft repository](https://github.com/microsoft/node-pty). Real macOS PTY tests cover UTF-8, ANSI bytes, resize, exit codes, bounded output, control leases and termination of the owned process group. Linux/WSL2 remain untested; native Windows is explicitly rejected by the current supervisor.
- The installed macOS prebuilt `spawn-helper` initially had mode 0644, causing `posix_spawnp failed`. `scripts/prepare-pty.mjs` repairs only this project dependency, using a private copy before changing permissions so a shared pnpm store inode is not modified. Both failure and passing evidence are retained.
- `@xterm/xterm` 6.0.0 was selected from the npm registry stable tag on 2026-10-01; MIT license. It is lazy loaded with the terminal page. No clipboard or external-link addon is installed; OSC 52 is suppressed. API/security references: [Terminal API](https://xtermjs.org/docs/api/terminal/classes/terminal/) and [security guide](https://xtermjs.org/docs/guides/security/).
- Installation evidence: `evidence/install-xterm.log`. Final build/typecheck evidence: `evidence/build-terminal-diagnostics-final.log`. Browser transport is exercised by `e2e/native-workflow.spec.ts`; fixture code is synthetic but its PTY/HTTP/SQLite transport is real.

A complete distributable SBOM, platform matrix and final vulnerability/license review are still release gates. This document does not assert that they have passed.

## Task DAG — 2026-10-01

`@xyflow/react` 12.12.0 was selected from the npm stable tag (MIT; declared React/React DOM peers >=17). It is lazy loaded for the dependency view. The application computes deterministic topological columns itself and uses React Flow for viewport controls, edges and node hosting; no separate graph-layout dependency was added. Installed API/source and the [accessibility guidance](https://reactflow.dev/learn/advanced-use/accessibility) were inspected. Source inspection plus a failing browser test identified that nonselectable/nondraggable nodes need an explicit pointer handler for inspection. `evidence/install-react-flow.log` records installation; `evidence/e2e-dag-pointer-fix.log` verifies the corrected mouse/keyboard flow and axe checks.
