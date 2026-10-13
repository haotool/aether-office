# @aether/office-scene

[Documentation](../../docs/README.md) · [Project](../../README.md)

Three.js office: building, characters, camera director, squads, office-life effects. Loaded lazily from the web app.

## Public surface

- Main export: `packages/office-scene/src/index.ts` (`OfficeScene`, model types).
- Subpath: `@aether/office-scene/model` → `src/model.ts`.

## Dependencies

- Depends on `@aether/contracts`, `@aether/kernel`, React, `@react-three/fiber`, `@react-three/drei`, `three`.
- Must not import Node, Fastify, SQLite, or `@aether/providers` (`scripts/check-boundaries.mjs`).
- Only `apps/web` ships this package to browsers.

## Test locally

```bash
pnpm exec vitest run tests/aether/office-scene-pure.test.ts
pnpm exec vitest run tests/aether/scene-characterization.test.ts
```

GPU-heavy perf specs live under `e2e/` and are not required for package edits.
