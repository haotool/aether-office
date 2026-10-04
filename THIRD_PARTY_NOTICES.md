# Third-party notices

AETHER OFFICE is a fork of [AgentSystemLabs/agent-office](https://github.com/AgentSystemLabs/agent-office), baseline commit `665aeec571bc03f76cbd16de8d628dd169a48874`.

Copyright (c) 2026 AgentSystemLabs. MIT License, retained in `LICENSE`.
The original source under `src/`, original tests and `blender/` retain this attribution. The AETHER PBR geometry helpers in `packages/office-scene/src/geometry.ts` adapt the upstream `src/client/world/toon.ts` rounded geometry and mesh merging implementation. New code does not change the upstream authorship of these portions.

`apps/control/src/services/redaction.ts` adapts the secret patterns of [stablyai/orca](https://github.com/stablyai/orca) `src/shared/crash-report-redaction.ts` (commit `373d951b`), Copyright (c) 2026 Lovecast Inc., MIT License.

Other cloned repositories are read-only research inputs in ignored `.research/`; they are not bundled or runtime dependencies. See `docs/research/SOURCES.json`. In particular, MCP Agent Mail has an additional license rider and is excluded from reuse.

Node.js, React, Three.js, R3F, Drei, Fastify, SQLite/better-sqlite3, Drizzle, Zod and the other installed packages retain their own licenses. Selected versions and registry license metadata are recorded in `evidence/dependency-registry.json`; the lockfile records resolved transitive versions. A distributable SBOM is still pending and must be produced before release.

No external font file, paid model, texture or HDR image has been downloaded into the product. Current 3D architecture and furnishings are procedural; interim actors are not claimed to be final Blender assets.

The terminal implementation uses Microsoft `node-pty` 1.1.0 and `@xterm/xterm` 6.0.0 under their MIT licenses. Their package license files remain in the installed distributions. See `docs/DEPENDENCY_AUDIT.md` for the inspected sources and platform evidence.

The lazy task dependency view uses `@xyflow/react` 12.12.0 (React Flow) under MIT, with its attribution retained. Its resolved dependencies and integrity hashes are pinned in `pnpm-lock.yaml`.
