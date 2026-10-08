# Dependencies

Direct runtime and development dependencies are pinned in each package manifest and in `pnpm-lock.yaml`. `pnpm-workspace.yaml` sets supply-chain controls: a release younger than a day is not installed, a package whose publish
evidence is weaker than an earlier version's is refused, and dependencies may not come from git or tarball URLs.
Licenses and attributions are in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md), generated from the lockfile by
`pnpm run notices`; the audited inventory and the licence policy (which licences are allowed, and how to add a dependency) are in
[docs/legal](legal/README.md). `pnpm run notices:check` (CI) fails when a dependency has an unknown or denied licence or the
notices are stale. No dependency in the lockfile is GPL, LGPL or AGPL.

Run `pnpm audit:gate` for high-severity advisories and `pnpm run doctor` for the installed toolchain.

## Notable choices

- **`node-pty` 1.1.0** (MIT) provides the real PTY for managed terminals. The macOS prebuilt `spawn-helper` can ship without
  its executable bit, which makes `posix_spawnp` fail; `scripts/prepare-pty.mjs` repairs only this project's copy (using a private
  copy first, so a shared pnpm store is not modified). Linux and WSL2 are untested; native Windows is refused by the supervisor.
- **`@xterm/xterm` 6.x** (MIT) renders terminals in the browser, lazily loaded with the terminal page. No clipboard or
  external-link add-on is installed and OSC 52 is suppressed. See the xterm.js
  [terminal API](https://xtermjs.org/docs/api/terminal/classes/terminal/) and [security guide](https://xtermjs.org/docs/guides/security/).
- **`@xyflow/react` 12.x** (MIT) hosts the task dependency graph, lazily loaded. The application computes deterministic
  topological columns itself, so no layout dependency is needed. Nodes that are neither selectable nor draggable need an explicit
  pointer handler to open details; see the [React Flow accessibility guidance](https://reactflow.dev/learn/advanced-use/accessibility).
- **`@a2a-js/sdk`** (Apache-2.0) is used only for its framework-agnostic JSON-RPC handler; its optional peers (Express, gRPC, SQL
  drivers) are not installed.
- **`@anthropic-ai/claude-agent-sdk`** is distributed under Anthropic's own terms and installed from npm; see the notices.
- Two copies of the Claude Agent SDK can appear in the lockfile: the runtime copy and the one pinned by the ACP adapter used only
  in an interoperability test.
- Peer ranges are respected without overrides, `--force` or `--legacy-peer-deps`.

## Release gates still open

A CycloneDX software bill of materials is generated on demand (`node scripts/oss/third-party-notices.mjs --sbom <file>`) and is
attached to a release rather than committed. A platform matrix, a final vulnerability review and the open licensing items of
the [inventory](legal/inventory.md#open-items) are release gates. This document does not assert that they have passed.
