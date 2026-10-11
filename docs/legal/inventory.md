# Licence inventory

The audited inventory of everything AETHER OFFICE uses, derives from or ships, as of 2026-10-07 (version `0.4.0`,
`pnpm-lock.yaml` with 425 packages). Each finding names its source of truth. This is an engineering record, not legal advice;
items that need a decision are collected in [Open items](#open-items).

## How the audit was done

- **npm packages.** `scripts/oss/third-party-notices.mjs` parses `pnpm-lock.yaml`, computes the production closure of
  `apps/control`, `apps/runner` and `apps/web` (following workspace links, dependencies and optional dependencies; `vite`
  and `@vitejs/plugin-react` are build tools and `@types/*` packages are erased at compile time, so neither is counted as
  shipped), and reads each installed package's `package.json` and licence files in `node_modules/.pnpm`. The licence file is
  recognised independently of the `license` field and the two must agree (three packages declare `BSD-3-Clause` with a third
  clause worded "The names of any contributors may not be used...", which the recogniser handles; `lucide-react` declares ISC
  and ships ISC plus the MIT text of Feather, from which part of it derives). The table at the end of this file is generated
  by the script and checked in CI.
- **Shipping.** `apps/web/dist` (Vite) inlines the browser dependencies and strips their licence comments, so the build now
  carries `LICENSE.txt` and `THIRD_PARTY_NOTICES.txt` (linked from Settings, About). `apps/control/dist` and
  `apps/runner/dist` (esbuild) bundle only this repository's workspace code: every third-party package is imported from
  `node_modules` (verified in the built files: `fastify`, `better-sqlite3`, `@anthropic-ai/claude-agent-sdk`, `node-pty` and
  the others remain `import` statements). No release artefact bundles `node_modules`.
- **Copied code.** A token-level overlap scan against the 27 reference clones; see
  [provenance](provenance.md#evidence-that-no-code-was-copied).
- **Assets.** Every GLB was parsed (generator, copyright, extras, images, URIs); texture origins were traced to the build
  script; fonts, sounds, HDR files and third-party logos were searched for.
- **External terms.** Read on 2026-10-07: Claude Code legal and compliance page, Anthropic Trademark Guidelines, OpenAI brand
  guidelines (via search extracts), `LICENSE` and `NOTICE` of openai/codex, SPDX licence texts for `LICENSES/`.

## npm dependencies: findings

| Topic | Finding | Source of truth | Obligation and decision |
| --- | --- | --- | --- |
| Denied licences (GPL, LGPL, AGPL, SSPL, BUSL, Elastic, Commons Clause, non-commercial) | None, shipped or development. | `license` fields and licence files of all 425 packages | Enforced by `notices:check`. |
| `SEE LICENSE IN ...` (4 packages) | `@anthropic-ai/claude-agent-sdk` 0.3.286 and 0.3.287 (`SEE LICENSE IN README.md`), `@anthropic-ai/claude-agent-sdk-darwin-arm64` 0.3.286 and 0.3.287 (`SEE LICENSE IN LICENSE.md`); the other platform builds are not installed on the audit machine and are recorded by family. `LICENSE.md`: "© Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance." | Installed `package.json` and `LICENSE.md` | Proprietary. Used as an npm dependency only: not copied into the repository and not bundled (the runner imports it at run time). 0.3.287 is the runtime copy; 0.3.286 is pulled only by `@agentclientprotocol/claude-agent-acp` in an interoperability test (development). The platform builds contain the Claude Code executable; it is installed by the package manager on the user's machine, never redistributed by this project. Recorded in `EXCEPTIONS`. |
| Dual licences (`OR`) and `WITH` exceptions | None in the lockfile (no `OR`, `AND` or `WITH` expression is declared). | `license` fields | The script would record the chosen option (the first allowed one in policy order). |
| Missing `license` field | `webgl-constants` 1.1.1 (shipped, web bundle): the `LICENSE` file is MIT, "Copyright (c) 2019 Tim van Scherpenzeel". | Licence file | Recorded in `EXCEPTIONS` as MIT. |
| No licence file in the package | `@mediapipe/tasks-vision`, `draco3d` (Apache-2.0); `@react-three/fiber`, `abstract-logging`, `maath`, `standardwebhooks`, `stats-gl` (MIT), all shipped. | Package contents | The notices name them and point to the standard text in `LICENSES/` with the declared author. *Residual:* their exact copyright line is unknown. |
| BlueOak-1.0.0 | `glob`, `lru-cache`, `minimatch`, `minipass`, `path-scurry` (shipped through `@modelcontextprotocol/sdk` and others). | `LICENSE.md` | Permissive; text reproduced. |
| MPL-2.0 | `axe-core`, `@axe-core/playwright`, `lightningcss` and its platform builds: development and build only, used unmodified; nothing of them reaches `apps/web/dist` (lightningcss transforms CSS at build time; its code is not emitted). | Lockfile closure | No obligation while unmodified and not distributed. A shipped MPL package would need an `APPROVED` entry. |
| Apache-2.0 NOTICE files | No shipped package has a NOTICE file. Development only: `typescript` and its platform builds (`NOTICE.txt`). | Package contents | The generator reproduces any NOTICE of a shipped package automatically. |
| Unlicense | `fast-sha256` (shipped). | `LICENSE` | Public-domain dedication; text reproduced. |
| Native modules | `better-sqlite3` (MIT) compiles the SQLite amalgamation in `deps/sqlite3` (public domain, "here is a blessing"). `node-pty` (MIT) ships Microsoft ConPTY binaries (`third_party/conpty`, from Windows Terminal, MIT) and `deps/winpty` (MIT, its own `LICENSE`) for Windows; native Windows is refused by the supervisor. | Package contents | Both are installed from npm and not redistributed by this project. *Residual:* the generator reproduces each package's top-level licence only, not nested third-party licences inside a package. |
| Three.js, React Three Fiber, Drei | MIT. Drei pulls in `hls.js`, `draco3d`, `@mediapipe/tasks-vision`, `@dimforge/rapier3d-compat` (Apache-2.0) and `troika-*` (MIT). All are counted as shipped, conservatively: the web build tree-shakes most of them (the glTF loader's Draco code path is present, but no Draco decoder or HDR preset is ever loaded, from a CDN or otherwise). | Lockfile, `apps/web/dist` | Notices include them. |
| Icons | `lucide-react` (ISC; parts derived from Feather, MIT). | `LICENSE` | Both texts reproduced. |
| Fonts | None bundled (system font stack). | `apps/web/src/styles/core/tokens.css` | — |
| Other notable runtime packages | `react`, `react-dom`, `react-router-dom`, `zustand`, `@tanstack/react-query`, `@xterm/xterm`, `@xyflow/react`, `qrcode`, `zod`, `fastify` and its plugins, `ws`, `@modelcontextprotocol/sdk`, `@anthropic-ai/sdk` (MIT); `@a2a-js/sdk`, `@agentclientprotocol/sdk` (Apache-2.0, no NOTICE). | Generated table | Permissive; texts reproduced. |

## Code ported or derived

| What | Licence | Status |
| --- | --- | --- |
| agent-office (upstream): `tools/blender/aokit.py`, part of `tools/blender/build_animals.py`, `packages/office-scene/src/environment/geometry.ts` | MIT | Derived; copyright kept in `LICENSE`, `NOTICE`, `REUSE.toml`, file headers. |
| Orca: `apps/control/src/services/platform/redaction.ts` (secret patterns) | MIT | Derived; licence text in the notices, header, `REUSE.toml`. |
| *mulberry32* in `apps/web/src/avatar/spec.ts` | Public domain (as published by its author) | Four lines, named in a comment. |
| Contributor Covenant 2.1 in `.github/CODE_OF_CONDUCT.md` | CC BY 4.0 | Adapted and credited; `LICENSES/CC-BY-4.0.txt`, `REUSE.toml`. |
| Everything else, including all ideas from the 27 reference projects | — | Original. No copied code found; see [provenance](provenance.md). |

## Generated and vendored material

| Path | Origin | Licence and notice |
| --- | --- | --- |
| `packages/providers/generated/codex-0.159.2-ts` (734 files) | Codex CLI 0.159.2 `generate-ts`, unmodified | Apache-2.0 (openai/codex, verified); `LICENSES/Apache-2.0.txt`, Codex NOTICE in `NOTICE` and the notices; types only, not in any build. |
| `packages/providers/generated/compat.json` | Written by this project | MIT. |
| Claude hook payloads | Described by hand-written Zod schemas in `packages/contracts`; no schema file was copied from Anthropic. | MIT. |
| `tests/processes/`, `tests/aether/fixtures/` | Synthetic (stated in the files); model-list fixtures reproduce the shape of local CLI caches | MIT; no personal data found. |
| `docs/research/` | The project's own comparison report (Traditional Chinese), a matrix and source index with links and pinned commits; no README or source file of another project is reproduced, quotations are short. | MIT. |

## Assets

All original or generated by this repository; details and the GLB inspection in [provenance](provenance.md#assets). No
third-party mesh, texture, HDR image, font, sound or logo file is in the tree.

## Project-level files

| Item | State |
| --- | --- |
| `LICENSE` | Standard MIT text, verified against the SPDX text; copyright lines "2026 haotool" and "2026 AgentSystemLabs" (upstream). Correct; unchanged. |
| `package.json` `license` | Root `MIT`; the workspace packages now declare `MIT` too (private packages: the field states the licence of the code, `private` prevents publishing; `UNLICENSED` would contradict the repository licence). *Not changed:* `packages/office-scene/package.json` (owned by concurrent work), to be aligned. |
| `NOTICE` | Added: project copyright, upstream and Orca attribution, the Codex NOTICE required by Apache-2.0 section 4(d). |
| SPDX / REUSE | `REUSE.toml` covers every tracked file by path; `LICENSES/` holds MIT, Apache-2.0 and CC-BY-4.0. `scripts/oss/reuse-check.mjs` checks coverage (the `reuse` tool is not required). |
| Contributions | Inbound = outbound MIT; DCO sign-off recommended in [licence-policy](licence-policy.md#contributor-sign-off). |
| `.github/SECURITY.md`, `.github/CODE_OF_CONDUCT.md`, issue and pull request templates | Present. Code of conduct credits the Contributor Covenant (CC BY 4.0). |
| GitHub Actions | `actions/checkout` and `actions/setup-node` pinned to commit SHAs (v4.4.0); Dependabot updates both npm and Actions weekly. |

## Open items

1. **Provider marks** that resemble the Claude and OpenAI logos, kept as small provider indicators (the Happy project's practice): residual risk accepted by the maintainer, see [trademarks](trademarks.md#provider-marks).
2. **Claude subscription use through the Agent SDK.** The runner starts Claude sessions with `@anthropic-ai/claude-agent-sdk`
   in the user's own environment (their `HOME`, so their own Claude Code login, or `ANTHROPIC_API_KEY`). Anthropic's terms
   say developers building on the Agent SDK should use API-key authentication and may not route requests through Free, Pro
   or Max plan credentials on behalf of their users; they also allow an end user to sign in to the unmodified Claude Code
   with their own subscription. AETHER is self-hosted by the user for their own sessions, so it is likely the latter, but the
   maintainer should decide (and possibly ask Anthropic) and say in the documentation which authentication is supported.
3. **Nested licences** inside packages (node-pty's ConPTY and winpty, better-sqlite3's SQLite, axe-core's
   `LICENSE-3RD-PARTY.txt`) are not reproduced; acceptable while the project does not redistribute `node_modules`.
4. **Packages without a licence file** (seven, listed above): their copyright line could not be verified.
5. **DCO enforcement** in CI: maintainer decision.

## npm packages

The generated table: every package in the lockfile, the licence its `package.json` declares, the licence that applies, where
it is used and how it was verified.

<!-- BEGIN GENERATED: npm-inventory (scripts/oss/third-party-notices.mjs) -->

428 packages in `pnpm-lock.yaml` (265 shipped). By scope and
licence: shipped MIT: 209; dev MIT: 108; dev Apache-2.0: 29; shipped ISC: 27; dev MPL-2.0: 14; dev LicenseRef-Anthropic-Commercial-Terms: 9; shipped LicenseRef-Anthropic-Commercial-Terms: 9; shipped BSD-3-Clause: 7; shipped Apache-2.0: 6; shipped BlueOak-1.0.0: 5; dev BSD-3-Clause: 2; dev ISC: 1; shipped BSD-2-Clause: 1; shipped Unlicense: 1.

| Package | Version | Declared (package.json) | Applies | Used in | Verified against |
| --- | --- | --- | --- | --- | --- |
| @a2a-js/sdk | 1.3.0 | Apache-2.0 | Apache-2.0 | server runtime | LICENSE reads as Apache-2.0 |
| @agentclientprotocol/claude-agent-acp | 0.85.1 | Apache-2.0 | Apache-2.0 | dev/build | LICENSE reads as Apache-2.0 |
| @agentclientprotocol/sdk | 1.6.0 | Apache-2.0 | Apache-2.0 | dev/build | LICENSE reads as Apache-2.0 |
| @agentclientprotocol/sdk | 1.7.0 | Apache-2.0 | Apache-2.0 | server runtime | LICENSE reads as Apache-2.0 |
| @anthropic-ai/claude-agent-sdk-darwin-arm64 | 0.3.286 | (platform build) | LicenseRef-Anthropic-Commercial-Terms | dev/build | platform build (family licence) |
| @anthropic-ai/claude-agent-sdk-darwin-arm64 | 0.3.287 | (platform build) | LicenseRef-Anthropic-Commercial-Terms | server runtime | platform build (family licence) |
| @anthropic-ai/claude-agent-sdk-darwin-x64 | 0.3.286 | (platform build) | LicenseRef-Anthropic-Commercial-Terms | dev/build | platform build (family licence) |
| @anthropic-ai/claude-agent-sdk-darwin-x64 | 0.3.287 | (platform build) | LicenseRef-Anthropic-Commercial-Terms | server runtime | platform build (family licence) |
| @anthropic-ai/claude-agent-sdk-linux-arm64-musl | 0.3.286 | (platform build) | LicenseRef-Anthropic-Commercial-Terms | dev/build | platform build (family licence) |
| @anthropic-ai/claude-agent-sdk-linux-arm64-musl | 0.3.287 | (platform build) | LicenseRef-Anthropic-Commercial-Terms | server runtime | platform build (family licence) |
| @anthropic-ai/claude-agent-sdk-linux-arm64 | 0.3.286 | (platform build) | LicenseRef-Anthropic-Commercial-Terms | dev/build | platform build (family licence) |
| @anthropic-ai/claude-agent-sdk-linux-arm64 | 0.3.287 | (platform build) | LicenseRef-Anthropic-Commercial-Terms | server runtime | platform build (family licence) |
| @anthropic-ai/claude-agent-sdk-linux-x64-musl | 0.3.286 | (platform build) | LicenseRef-Anthropic-Commercial-Terms | dev/build | platform build (family licence) |
| @anthropic-ai/claude-agent-sdk-linux-x64-musl | 0.3.287 | (platform build) | LicenseRef-Anthropic-Commercial-Terms | server runtime | platform build (family licence) |
| @anthropic-ai/claude-agent-sdk-linux-x64 | 0.3.286 | (platform build) | LicenseRef-Anthropic-Commercial-Terms | dev/build | platform build (family licence) |
| @anthropic-ai/claude-agent-sdk-linux-x64 | 0.3.287 | (platform build) | LicenseRef-Anthropic-Commercial-Terms | server runtime | platform build (family licence) |
| @anthropic-ai/claude-agent-sdk-win32-arm64 | 0.3.286 | (platform build) | LicenseRef-Anthropic-Commercial-Terms | dev/build | platform build (family licence) |
| @anthropic-ai/claude-agent-sdk-win32-arm64 | 0.3.287 | (platform build) | LicenseRef-Anthropic-Commercial-Terms | server runtime | platform build (family licence) |
| @anthropic-ai/claude-agent-sdk-win32-x64 | 0.3.286 | (platform build) | LicenseRef-Anthropic-Commercial-Terms | dev/build | platform build (family licence) |
| @anthropic-ai/claude-agent-sdk-win32-x64 | 0.3.287 | (platform build) | LicenseRef-Anthropic-Commercial-Terms | server runtime | platform build (family licence) |
| @anthropic-ai/claude-agent-sdk | 0.3.286 | SEE LICENSE IN README.md | LicenseRef-Anthropic-Commercial-Terms | dev/build | recorded decision |
| @anthropic-ai/claude-agent-sdk | 0.3.287 | SEE LICENSE IN README.md | LicenseRef-Anthropic-Commercial-Terms | server runtime | recorded decision |
| @anthropic-ai/sdk | 0.131.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| @axe-core/playwright | 4.13.0 | MPL-2.0 | MPL-2.0 | dev/build | LICENSE reads as MPL-2.0 |
| @babel/helper-string-parser | 7.29.7 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @babel/helper-validator-identifier | 7.29.7 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @babel/parser | 7.29.9 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @babel/runtime | 7.29.7 | MIT | MIT | web bundle, server runtime | LICENSE reads as MIT |
| @babel/types | 7.29.8 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @bcoe/v8-coverage | 1.0.2 | MIT | MIT | dev/build | LICENSE.md reads as MIT |
| @dimforge/rapier3d-compat | 0.12.0 | Apache-2.0 | Apache-2.0 | dev/build | LICENSE reads as Apache-2.0 |
| @esbuild/aix-ppc64 | 0.28.2 | (platform build) | MIT | dev/build | platform build (family licence) |
| @esbuild/android-arm64 | 0.28.2 | (platform build) | MIT | dev/build | platform build (family licence) |
| @esbuild/android-arm | 0.28.2 | (platform build) | MIT | dev/build | platform build (family licence) |
| @esbuild/android-x64 | 0.28.2 | (platform build) | MIT | dev/build | platform build (family licence) |
| @esbuild/darwin-arm64 | 0.28.2 | (platform build) | MIT | dev/build | platform build (family licence) |
| @esbuild/darwin-x64 | 0.28.2 | (platform build) | MIT | dev/build | platform build (family licence) |
| @esbuild/freebsd-arm64 | 0.28.2 | (platform build) | MIT | dev/build | platform build (family licence) |
| @esbuild/freebsd-x64 | 0.28.2 | (platform build) | MIT | dev/build | platform build (family licence) |
| @esbuild/linux-arm64 | 0.28.2 | (platform build) | MIT | dev/build | platform build (family licence) |
| @esbuild/linux-arm | 0.28.2 | (platform build) | MIT | dev/build | platform build (family licence) |
| @esbuild/linux-ia32 | 0.28.2 | (platform build) | MIT | dev/build | platform build (family licence) |
| @esbuild/linux-loong64 | 0.28.2 | (platform build) | MIT | dev/build | platform build (family licence) |
| @esbuild/linux-mips64el | 0.28.2 | (platform build) | MIT | dev/build | platform build (family licence) |
| @esbuild/linux-ppc64 | 0.28.2 | (platform build) | MIT | dev/build | platform build (family licence) |
| @esbuild/linux-riscv64 | 0.28.2 | (platform build) | MIT | dev/build | platform build (family licence) |
| @esbuild/linux-s390x | 0.28.2 | (platform build) | MIT | dev/build | platform build (family licence) |
| @esbuild/linux-x64 | 0.28.2 | (platform build) | MIT | dev/build | platform build (family licence) |
| @esbuild/netbsd-arm64 | 0.28.2 | (platform build) | MIT | dev/build | platform build (family licence) |
| @esbuild/netbsd-x64 | 0.28.2 | (platform build) | MIT | dev/build | platform build (family licence) |
| @esbuild/openbsd-arm64 | 0.28.2 | (platform build) | MIT | dev/build | platform build (family licence) |
| @esbuild/openbsd-x64 | 0.28.2 | (platform build) | MIT | dev/build | platform build (family licence) |
| @esbuild/openharmony-arm64 | 0.28.2 | (platform build) | MIT | dev/build | platform build (family licence) |
| @esbuild/sunos-x64 | 0.28.2 | (platform build) | MIT | dev/build | platform build (family licence) |
| @esbuild/win32-arm64 | 0.28.2 | (platform build) | MIT | dev/build | platform build (family licence) |
| @esbuild/win32-ia32 | 0.28.2 | (platform build) | MIT | dev/build | platform build (family licence) |
| @esbuild/win32-x64 | 0.28.2 | (platform build) | MIT | dev/build | platform build (family licence) |
| @fastify/accept-negotiator | 2.1.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| @fastify/ajv-compiler | 4.0.6 | MIT | MIT | server runtime | LICENSE reads as MIT |
| @fastify/cookie | 11.1.2 | MIT | MIT | server runtime | LICENSE reads as MIT |
| @fastify/error | 4.2.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| @fastify/fast-json-stringify-compiler | 5.1.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| @fastify/forwarded | 3.0.2 | MIT | MIT | server runtime | LICENSE reads as MIT |
| @fastify/merge-json-schemas | 0.2.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| @fastify/proxy-addr | 5.1.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| @fastify/send | 4.1.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| @fastify/static | 10.1.5 | MIT | MIT | server runtime | LICENSE reads as MIT |
| @hono/node-server | 2.1.3 | MIT | MIT | server runtime | LICENSE reads as MIT |
| @jridgewell/resolve-uri | 3.1.2 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @jridgewell/sourcemap-codec | 1.6.0 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @jridgewell/trace-mapping | 0.3.31 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @lukeed/ms | 2.0.2 | MIT | MIT | server runtime | license reads as MIT |
| @mediapipe/tasks-vision | 0.10.17 | Apache-2.0 | Apache-2.0 | web bundle | no licence file; package.json only |
| @modelcontextprotocol/sdk | 1.31.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| @monogrid/gainmap-js | 3.4.0 | MIT | MIT | web bundle | LICENSE reads as MIT |
| @oxc-project/types | 0.151.0 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @pinojs/redact | 0.4.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| @playwright/test | 1.63.0 | Apache-2.0 | Apache-2.0 | dev/build | LICENSE reads as Apache-2.0 |
| @react-three/drei | 10.7.9 | MIT | MIT | web bundle | LICENSE reads as MIT |
| @react-three/fiber | 9.8.1 | MIT | MIT | web bundle | no licence file; package.json only |
| @rolldown/binding-android-arm-eabi | 1.2.11 | (platform build) | MIT | dev/build | platform build (family licence) |
| @rolldown/binding-android-arm64 | 1.2.11 | (platform build) | MIT | dev/build | platform build (family licence) |
| @rolldown/binding-darwin-arm64 | 1.2.11 | (platform build) | MIT | dev/build | platform build (family licence) |
| @rolldown/binding-darwin-x64 | 1.2.11 | (platform build) | MIT | dev/build | platform build (family licence) |
| @rolldown/binding-freebsd-x64 | 1.2.11 | (platform build) | MIT | dev/build | platform build (family licence) |
| @rolldown/binding-linux-arm-gnueabihf | 1.2.11 | (platform build) | MIT | dev/build | platform build (family licence) |
| @rolldown/binding-linux-arm64-gnu | 1.2.11 | (platform build) | MIT | dev/build | platform build (family licence) |
| @rolldown/binding-linux-arm64-musl | 1.2.11 | (platform build) | MIT | dev/build | platform build (family licence) |
| @rolldown/binding-linux-ppc64-gnu | 1.2.11 | (platform build) | MIT | dev/build | platform build (family licence) |
| @rolldown/binding-linux-s390x-gnu | 1.2.11 | (platform build) | MIT | dev/build | platform build (family licence) |
| @rolldown/binding-linux-x64-gnu | 1.2.11 | (platform build) | MIT | dev/build | platform build (family licence) |
| @rolldown/binding-linux-x64-musl | 1.2.11 | (platform build) | MIT | dev/build | platform build (family licence) |
| @rolldown/binding-openharmony-arm64 | 1.2.11 | (platform build) | MIT | dev/build | platform build (family licence) |
| @rolldown/binding-win32-arm64-msvc | 1.2.11 | (platform build) | MIT | dev/build | platform build (family licence) |
| @rolldown/binding-win32-x64-msvc | 1.2.11 | (platform build) | MIT | dev/build | platform build (family licence) |
| @rolldown/pluginutils | 1.0.1 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @stablelib/base64 | 1.0.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| @tanstack/query-core | 5.104.1 | MIT | MIT | web bundle | LICENSE reads as MIT |
| @tanstack/react-query | 5.104.1 | MIT | MIT | web bundle | LICENSE reads as MIT |
| @tweenjs/tween.js | 23.1.3 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @types/better-sqlite3 | 9.6.0 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @types/chai | 5.2.3 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @types/d3-color | 3.1.3 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @types/d3-drag | 3.0.7 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @types/d3-interpolate | 3.0.4 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @types/d3-selection | 3.0.12 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @types/d3-transition | 3.0.9 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @types/d3-zoom | 3.0.9 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @types/deep-eql | 4.0.2 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @types/draco3d | 1.4.10 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @types/estree | 1.0.9 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @types/node | 26.6.4 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @types/offscreencanvas | 2019.7.3 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @types/qrcode | 1.5.6 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @types/react-dom | 19.3.0 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @types/react-reconciler | 0.28.9 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @types/react | 19.3.0 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @types/stats.js | 0.17.4 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @types/three | 0.186.0 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @types/webxr | 0.5.24 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @typescript/typescript-aix-ppc64 | 7.0.2 | (platform build) | Apache-2.0 | dev/build | platform build (family licence) |
| @typescript/typescript-darwin-arm64 | 7.0.2 | (platform build) | Apache-2.0 | dev/build | platform build (family licence) |
| @typescript/typescript-darwin-x64 | 7.0.2 | (platform build) | Apache-2.0 | dev/build | platform build (family licence) |
| @typescript/typescript-freebsd-arm64 | 7.0.2 | (platform build) | Apache-2.0 | dev/build | platform build (family licence) |
| @typescript/typescript-freebsd-x64 | 7.0.2 | (platform build) | Apache-2.0 | dev/build | platform build (family licence) |
| @typescript/typescript-linux-arm64 | 7.0.2 | (platform build) | Apache-2.0 | dev/build | platform build (family licence) |
| @typescript/typescript-linux-arm | 7.0.2 | (platform build) | Apache-2.0 | dev/build | platform build (family licence) |
| @typescript/typescript-linux-loong64 | 7.0.2 | (platform build) | Apache-2.0 | dev/build | platform build (family licence) |
| @typescript/typescript-linux-mips64el | 7.0.2 | (platform build) | Apache-2.0 | dev/build | platform build (family licence) |
| @typescript/typescript-linux-ppc64 | 7.0.2 | (platform build) | Apache-2.0 | dev/build | platform build (family licence) |
| @typescript/typescript-linux-riscv64 | 7.0.2 | (platform build) | Apache-2.0 | dev/build | platform build (family licence) |
| @typescript/typescript-linux-s390x | 7.0.2 | (platform build) | Apache-2.0 | dev/build | platform build (family licence) |
| @typescript/typescript-linux-x64 | 7.0.2 | (platform build) | Apache-2.0 | dev/build | platform build (family licence) |
| @typescript/typescript-netbsd-arm64 | 7.0.2 | (platform build) | Apache-2.0 | dev/build | platform build (family licence) |
| @typescript/typescript-netbsd-x64 | 7.0.2 | (platform build) | Apache-2.0 | dev/build | platform build (family licence) |
| @typescript/typescript-openbsd-arm64 | 7.0.2 | (platform build) | Apache-2.0 | dev/build | platform build (family licence) |
| @typescript/typescript-openbsd-x64 | 7.0.2 | (platform build) | Apache-2.0 | dev/build | platform build (family licence) |
| @typescript/typescript-sunos-x64 | 7.0.2 | (platform build) | Apache-2.0 | dev/build | platform build (family licence) |
| @typescript/typescript-win32-arm64 | 7.0.2 | (platform build) | Apache-2.0 | dev/build | platform build (family licence) |
| @typescript/typescript-win32-x64 | 7.0.2 | (platform build) | Apache-2.0 | dev/build | platform build (family licence) |
| @use-gesture/core | 10.3.1 | MIT | MIT | web bundle | LICENSE reads as MIT |
| @use-gesture/react | 10.3.1 | MIT | MIT | web bundle | LICENSE reads as MIT |
| @vitejs/plugin-react | 6.1.1 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @vitest/coverage-v8 | 5.0.3 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @vitest/istanbul-lib-coverage | 1.0.2 | MIT | MIT | dev/build | LICENSE reads as MIT + BSD-3-Clause |
| @vitest/istanbul-lib-report | 1.0.2 | MIT | MIT | dev/build | LICENSE reads as MIT + BSD-3-Clause |
| @vitest/mocker | 5.0.3 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @vitest/spy | 5.0.3 | MIT | MIT | dev/build | LICENSE reads as MIT |
| @xterm/xterm | 6.0.0 | MIT | MIT | web bundle | LICENSE reads as MIT |
| @xyflow/react | 12.12.0 | MIT | MIT | web bundle | LICENSE reads as MIT |
| @xyflow/system | 0.0.83 | MIT | MIT | web bundle | LICENSE reads as MIT |
| abstract-logging | 2.0.1 | MIT | MIT | server runtime | no licence file; package.json only |
| accepts | 2.0.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| ajv-formats | 3.0.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| ajv | 8.20.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| ansi-regex | 5.0.1 | MIT | MIT | server runtime | license reads as MIT |
| ansi-styles | 4.3.0 | MIT | MIT | server runtime | license reads as MIT |
| assertion-error | 2.0.1 | MIT | MIT | dev/build | LICENSE reads as MIT |
| ast-v8-to-istanbul | 1.0.7 | MIT | MIT | dev/build | LICENSE reads as MIT |
| atomic-sleep | 1.0.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| avvio | 9.3.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| axe-core | 4.13.0 | MPL-2.0 | MPL-2.0 | dev/build | LICENSE reads as MPL-2.0 |
| balanced-match | 4.0.4 | MIT | MIT | server runtime | LICENSE.md reads as MIT |
| base64-js | 1.5.1 | MIT | MIT | web bundle | LICENSE reads as MIT |
| better-sqlite3 | 13.0.3 | MIT | MIT | server runtime | LICENSE reads as MIT |
| bidi-js | 1.1.0 | MIT | MIT | web bundle | LICENSE.txt reads as MIT |
| body-parser | 2.3.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| brace-expansion | 5.0.12 | MIT | MIT | server runtime | LICENSE reads as MIT |
| buffer | 6.0.3 | MIT | MIT | web bundle | LICENSE reads as MIT |
| bytes | 3.1.2 | MIT | MIT | server runtime | LICENSE reads as MIT |
| call-bind-apply-helpers | 1.0.2 | MIT | MIT | server runtime | LICENSE reads as MIT |
| call-bound | 1.0.4 | MIT | MIT | server runtime | LICENSE reads as MIT |
| camelcase | 5.3.1 | MIT | MIT | server runtime | license reads as MIT |
| camera-controls | 3.1.2 | MIT | MIT | web bundle | LICENSE reads as MIT |
| chai | 6.2.2 | MIT | MIT | dev/build | LICENSE reads as MIT |
| classcat | 5.0.5 | MIT | MIT | web bundle | LICENSE.md reads as MIT |
| cliui | 6.0.0 | ISC | ISC | server runtime | LICENSE.txt reads as ISC |
| color-convert | 2.0.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| color-name | 1.1.4 | MIT | MIT | server runtime | LICENSE reads as MIT |
| content-disposition | 1.1.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| content-disposition | 3.0.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| content-type | 1.0.5 | MIT | MIT | server runtime | LICENSE reads as MIT |
| content-type | 2.1.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| cookie-signature | 1.2.2 | MIT | MIT | server runtime | LICENSE reads as MIT |
| cookie | 0.7.2 | MIT | MIT | server runtime | LICENSE reads as MIT |
| cookie | 1.1.1 | MIT | MIT | web bundle, server runtime | LICENSE reads as MIT |
| cookie | 2.0.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| cors | 2.8.6 | MIT | MIT | server runtime | LICENSE reads as MIT |
| cross-env | 7.0.3 | MIT | MIT | web bundle | LICENSE reads as MIT |
| cross-spawn | 7.0.6 | MIT | MIT | web bundle, server runtime | LICENSE reads as MIT |
| csstype | 3.2.3 | MIT | MIT | dev/build | LICENSE reads as MIT |
| d3-color | 3.1.0 | ISC | ISC | web bundle | LICENSE reads as ISC |
| d3-dispatch | 3.0.1 | ISC | ISC | web bundle | LICENSE reads as ISC |
| d3-drag | 3.0.0 | ISC | ISC | web bundle | LICENSE reads as ISC |
| d3-ease | 3.0.1 | BSD-3-Clause | BSD-3-Clause | web bundle | LICENSE reads as BSD-3-Clause |
| d3-interpolate | 3.0.1 | ISC | ISC | web bundle | LICENSE reads as ISC |
| d3-selection | 3.0.0 | ISC | ISC | web bundle | LICENSE reads as ISC |
| d3-timer | 3.0.1 | ISC | ISC | web bundle | LICENSE reads as ISC |
| d3-transition | 3.0.1 | ISC | ISC | web bundle | LICENSE reads as ISC |
| d3-zoom | 3.0.0 | ISC | ISC | web bundle | LICENSE reads as ISC |
| debug | 4.4.3 | MIT | MIT | server runtime | LICENSE reads as MIT |
| decamelize | 1.2.0 | MIT | MIT | server runtime | license reads as MIT |
| depd | 2.0.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| dequal | 2.0.3 | MIT | MIT | server runtime | license reads as MIT |
| detect-gpu | 5.0.70 | MIT | MIT | web bundle | LICENSE reads as MIT |
| detect-libc | 2.1.2 | Apache-2.0 | Apache-2.0 | dev/build | LICENSE reads as Apache-2.0 |
| diff | 9.0.0 | BSD-3-Clause | BSD-3-Clause | dev/build | LICENSE reads as BSD-3-Clause |
| dijkstrajs | 1.0.3 | MIT | MIT | server runtime | LICENSE.md (text not auto-recognised) |
| draco3d | 1.5.7 | Apache-2.0 | Apache-2.0 | web bundle | no licence file; package.json only |
| dunder-proto | 1.0.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| ee-first | 1.1.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| emoji-regex | 8.0.0 | MIT | MIT | server runtime | LICENSE-MIT.txt reads as MIT |
| encodeurl | 2.0.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| es-define-property | 1.0.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| es-errors | 1.3.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| es-module-lexer | 2.3.2 | MIT | MIT | dev/build | LICENSE reads as MIT |
| es-object-atoms | 1.1.2 | MIT | MIT | server runtime | LICENSE reads as MIT |
| esbuild | 0.28.2 | MIT | MIT | dev/build | LICENSE.md reads as MIT |
| escape-html | 1.0.3 | MIT | MIT | server runtime | LICENSE reads as MIT |
| estree-walker | 3.0.3 | MIT | MIT | dev/build | LICENSE reads as MIT |
| etag | 1.8.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| eventsource-parser | 3.1.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| eventsource | 3.0.7 | MIT | MIT | server runtime | LICENSE reads as MIT |
| expect-type | 1.4.0 | Apache-2.0 | Apache-2.0 | dev/build | LICENSE reads as Apache-2.0 |
| express-rate-limit | 8.7.0 | MIT | MIT | server runtime | license reads as MIT |
| express | 5.2.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| fast-decode-uri-component | 1.0.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| fast-deep-equal | 3.1.3 | MIT | MIT | server runtime | LICENSE reads as MIT |
| fast-json-stringify | 7.0.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| fast-querystring | 1.1.2 | MIT | MIT | server runtime | LICENSE reads as MIT |
| fast-sha256 | 1.3.0 | Unlicense | Unlicense | server runtime | LICENSE reads as Unlicense |
| fast-uri | 3.1.8 | BSD-3-Clause | BSD-3-Clause | server runtime | LICENSE reads as BSD-3-Clause |
| fast-uri | 4.2.1 | BSD-3-Clause | BSD-3-Clause | server runtime | LICENSE reads as BSD-3-Clause |
| fastify-plugin | 6.0.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| fastify | 5.12.5 | MIT | MIT | server runtime | LICENSE reads as MIT |
| fastq | 1.20.3 | ISC | ISC | server runtime | LICENSE reads as ISC |
| fdir | 6.5.0 | MIT | MIT | dev/build | LICENSE reads as MIT |
| fflate | 0.6.11 | MIT | MIT | web bundle | LICENSE reads as MIT |
| fflate | 0.8.3 | MIT | MIT | dev/build | LICENSE reads as MIT |
| finalhandler | 2.1.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| find-my-way | 9.9.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| find-up | 4.1.0 | MIT | MIT | server runtime | license reads as MIT |
| forwarded | 0.2.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| fresh | 2.0.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| fsevents | 2.3.3 | (platform build) | MIT | dev/build | platform build (family licence) |
| function-bind | 1.1.2 | MIT | MIT | server runtime | LICENSE reads as MIT |
| get-caller-file | 2.0.5 | ISC | ISC | server runtime | LICENSE.md reads as ISC |
| get-intrinsic | 1.3.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| get-proto | 1.0.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| glob | 13.0.6 | BlueOak-1.0.0 | BlueOak-1.0.0 | server runtime | LICENSE.md reads as BlueOak-1.0.0 |
| glsl-noise | 0.0.0 | MIT | MIT | web bundle | LICENSE reads as MIT |
| gopd | 1.2.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| has-symbols | 1.1.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| hasown | 2.0.4 | MIT | MIT | server runtime | LICENSE reads as MIT |
| hls.js | 1.7.3 | Apache-2.0 | Apache-2.0 | web bundle | LICENSE reads as Apache-2.0 |
| hono | 4.13.11 | MIT | MIT | server runtime | LICENSE reads as MIT |
| http-errors | 2.0.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| iconv-lite | 0.7.3 | MIT | MIT | server runtime | LICENSE reads as MIT |
| ieee754 | 1.2.1 | BSD-3-Clause | BSD-3-Clause | web bundle | LICENSE reads as BSD-3-Clause |
| immediate | 3.0.6 | MIT | MIT | web bundle | LICENSE.txt reads as MIT |
| inherits | 2.0.4 | ISC | ISC | server runtime | LICENSE reads as ISC |
| ip-address | 10.7.2 | MIT | MIT | server runtime | LICENSE reads as MIT |
| ipaddr.js | 1.9.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| ipaddr.js | 2.5.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| is-fullwidth-code-point | 3.0.0 | MIT | MIT | server runtime | license reads as MIT |
| is-promise | 2.2.2 | MIT | MIT | web bundle | LICENSE reads as MIT |
| is-promise | 4.0.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| isexe | 2.0.0 | ISC | ISC | web bundle, server runtime | LICENSE reads as ISC |
| its-fine | 2.1.1 | MIT | MIT | web bundle | LICENSE reads as MIT |
| jose | 6.2.12 | MIT | MIT | server runtime | LICENSE.md reads as MIT |
| js-tokens | 10.0.0 | MIT | MIT | dev/build | LICENSE reads as MIT |
| json-schema-ref-resolver | 3.0.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| json-schema-to-ts | 3.1.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| json-schema-traverse | 1.0.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| json-schema-typed | 8.0.2 | BSD-2-Clause | BSD-2-Clause | server runtime | LICENSE.md reads as BSD-2-Clause |
| lie | 3.3.0 | MIT | MIT | web bundle | license.md reads as MIT |
| light-my-request | 6.6.0 | BSD-3-Clause | BSD-3-Clause | server runtime | LICENSE reads as BSD-3-Clause |
| lightningcss-android-arm64 | 1.33.0 | (platform build) | MPL-2.0 | dev/build | platform build (family licence) |
| lightningcss-darwin-arm64 | 1.33.0 | (platform build) | MPL-2.0 | dev/build | platform build (family licence) |
| lightningcss-darwin-x64 | 1.33.0 | (platform build) | MPL-2.0 | dev/build | platform build (family licence) |
| lightningcss-freebsd-x64 | 1.33.0 | (platform build) | MPL-2.0 | dev/build | platform build (family licence) |
| lightningcss-linux-arm-gnueabihf | 1.33.0 | (platform build) | MPL-2.0 | dev/build | platform build (family licence) |
| lightningcss-linux-arm64-gnu | 1.33.0 | (platform build) | MPL-2.0 | dev/build | platform build (family licence) |
| lightningcss-linux-arm64-musl | 1.33.0 | (platform build) | MPL-2.0 | dev/build | platform build (family licence) |
| lightningcss-linux-x64-gnu | 1.33.0 | (platform build) | MPL-2.0 | dev/build | platform build (family licence) |
| lightningcss-linux-x64-musl | 1.33.0 | (platform build) | MPL-2.0 | dev/build | platform build (family licence) |
| lightningcss-win32-arm64-msvc | 1.33.0 | (platform build) | MPL-2.0 | dev/build | platform build (family licence) |
| lightningcss-win32-x64-msvc | 1.33.0 | (platform build) | MPL-2.0 | dev/build | platform build (family licence) |
| lightningcss | 1.33.0 | MPL-2.0 | MPL-2.0 | dev/build | LICENSE reads as MPL-2.0 |
| locate-path | 5.0.0 | MIT | MIT | server runtime | license reads as MIT |
| lru-cache | 11.5.3 | BlueOak-1.0.0 | BlueOak-1.0.0 | server runtime | LICENSE.md reads as BlueOak-1.0.0 |
| lucide-react | 1.50.0 | ISC | ISC | web bundle | LICENSE reads as MIT + ISC |
| maath | 0.10.8 | MIT | MIT | web bundle | no licence file; package.json only |
| magic-string | 1.4.2 | MIT | MIT | dev/build | LICENSE reads as MIT |
| magicast | 0.5.5 | MIT | MIT | dev/build | LICENSE reads as MIT |
| math-intrinsics | 1.1.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| media-typer | 1.1.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| merge-descriptors | 2.0.0 | MIT | MIT | server runtime | license reads as MIT |
| meshline | 3.3.1 | MIT | MIT | web bundle | LICENSE reads as MIT |
| meshoptimizer | 1.1.1 | MIT | MIT | dev/build | LICENSE.md reads as MIT |
| mime-db | 1.54.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| mime-types | 3.0.2 | MIT | MIT | server runtime | LICENSE reads as MIT |
| mime | 3.0.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| minimatch | 10.2.6 | BlueOak-1.0.0 | BlueOak-1.0.0 | server runtime | LICENSE.md reads as BlueOak-1.0.0 |
| minipass | 7.1.3 | BlueOak-1.0.0 | BlueOak-1.0.0 | server runtime | LICENSE.md reads as BlueOak-1.0.0 |
| ms | 2.1.3 | MIT | MIT | server runtime | license.md reads as MIT |
| nanoid | 3.3.19 | MIT | MIT | dev/build | LICENSE reads as MIT |
| negotiator | 1.1.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| node-addon-api | 7.1.1 | MIT | MIT | server runtime | LICENSE.md reads as MIT |
| node-addon-api | 8.9.2 | MIT | MIT | server runtime | LICENSE.md reads as MIT |
| node-pty | 1.1.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| object-assign | 4.1.1 | MIT | MIT | server runtime | license reads as MIT |
| object-inspect | 1.13.4 | MIT | MIT | server runtime | LICENSE reads as MIT |
| obug | 2.2.1 | MIT | MIT | dev/build | LICENSE reads as MIT |
| on-exit-leak-free | 2.1.2 | MIT | MIT | server runtime | LICENSE reads as MIT |
| on-finished | 2.4.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| once | 1.4.0 | ISC | ISC | server runtime | LICENSE reads as ISC |
| p-limit | 2.3.0 | MIT | MIT | server runtime | license reads as MIT |
| p-locate | 4.1.0 | MIT | MIT | server runtime | license reads as MIT |
| p-try | 2.2.0 | MIT | MIT | server runtime | license reads as MIT |
| parseurl | 1.3.3 | MIT | MIT | server runtime | LICENSE reads as MIT |
| path-exists | 4.0.0 | MIT | MIT | server runtime | license reads as MIT |
| path-key | 3.1.1 | MIT | MIT | web bundle, server runtime | license reads as MIT |
| path-scurry | 2.0.2 | BlueOak-1.0.0 | BlueOak-1.0.0 | server runtime | LICENSE.md reads as BlueOak-1.0.0 |
| path-to-regexp | 8.4.2 | MIT | MIT | server runtime | LICENSE reads as MIT |
| picocolors | 1.1.1 | ISC | ISC | dev/build | LICENSE reads as ISC |
| picomatch | 4.0.7 | MIT | MIT | dev/build | LICENSE reads as MIT |
| pino-abstract-transport | 3.0.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| pino-std-serializers | 7.1.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| pino | 10.3.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| pkce-challenge | 5.0.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| playwright-core | 1.63.0 | Apache-2.0 | Apache-2.0 | dev/build | LICENSE reads as Apache-2.0 |
| playwright | 1.63.0 | Apache-2.0 | Apache-2.0 | dev/build | LICENSE reads as Apache-2.0 |
| pngjs | 5.0.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| postcss | 8.5.28 | MIT | MIT | dev/build | LICENSE reads as MIT |
| potpack | 1.0.2 | ISC | ISC | web bundle | LICENSE reads as ISC |
| prettier | 3.9.9 | MIT | MIT | dev/build | LICENSE reads as MIT |
| process-warning | 4.0.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| process-warning | 5.1.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| promise-worker-transferable | 1.0.4 | Apache-2.0 | Apache-2.0 | web bundle | LICENSE reads as Apache-2.0 |
| proxy-addr | 2.0.8 | MIT | MIT | server runtime | LICENSE reads as MIT |
| qrcode | 1.5.4 | MIT | MIT | server runtime | license reads as MIT |
| qs | 6.16.0 | BSD-3-Clause | BSD-3-Clause | server runtime | LICENSE.md reads as BSD-3-Clause |
| quick-format-unescaped | 4.0.4 | MIT | MIT | server runtime | LICENSE reads as MIT |
| range-parser | 1.3.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| raw-body | 3.0.2 | MIT | MIT | server runtime | LICENSE reads as MIT |
| react-dom | 19.3.0 | MIT | MIT | web bundle | LICENSE reads as MIT |
| react-router-dom | 7.18.4 | MIT | MIT | web bundle | LICENSE.md reads as MIT |
| react-router | 7.18.4 | MIT | MIT | web bundle | LICENSE.md reads as MIT |
| react-use-measure | 2.1.7 | MIT | MIT | web bundle | LICENSE reads as MIT |
| react | 19.3.0 | MIT | MIT | web bundle | LICENSE reads as MIT |
| real-require | 0.2.0 | MIT | MIT | server runtime | LICENSE.md reads as MIT |
| real-require | 1.0.0 | MIT | MIT | server runtime | LICENSE.md reads as MIT |
| require-directory | 2.1.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| require-from-string | 2.0.2 | MIT | MIT | web bundle, server runtime | license reads as MIT |
| require-main-filename | 2.0.0 | ISC | ISC | server runtime | LICENSE.txt reads as ISC |
| ret | 0.5.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| reusify | 1.1.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| rfdc | 1.4.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| rolldown | 1.2.11 | MIT | MIT | dev/build | LICENSE reads as MIT |
| router | 2.2.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| safe-regex2 | 5.1.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| safe-stable-stringify | 2.5.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| safer-buffer | 2.1.2 | MIT | MIT | server runtime | LICENSE reads as MIT |
| scheduler | 0.28.0 | MIT | MIT | web bundle | LICENSE reads as MIT |
| secure-json-parse | 4.1.0 | BSD-3-Clause | BSD-3-Clause | server runtime | LICENSE reads as BSD-3-Clause |
| semver | 7.8.5 | ISC | ISC | server runtime | LICENSE reads as ISC |
| send | 1.2.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| serve-static | 2.2.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| set-blocking | 2.0.0 | ISC | ISC | server runtime | LICENSE.txt reads as ISC |
| set-cookie-parser | 2.7.2 | MIT | MIT | web bundle, server runtime | LICENSE reads as MIT |
| setprototypeof | 1.2.0 | ISC | ISC | server runtime | LICENSE reads as ISC |
| shebang-command | 2.0.0 | MIT | MIT | web bundle, server runtime | license reads as MIT |
| shebang-regex | 3.0.0 | MIT | MIT | web bundle, server runtime | license reads as MIT |
| side-channel-list | 1.0.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| side-channel-map | 1.0.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| side-channel-weakmap | 1.0.2 | MIT | MIT | server runtime | LICENSE reads as MIT |
| side-channel | 1.1.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| sonic-boom | 4.2.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| source-map-js | 1.2.2 | BSD-3-Clause | BSD-3-Clause | dev/build | LICENSE reads as BSD-3-Clause |
| split2 | 4.2.0 | ISC | ISC | server runtime | LICENSE reads as ISC |
| standardwebhooks | 1.1.1 | MIT | MIT | server runtime | no licence file; package.json only |
| stats-gl | 2.4.2 | MIT | MIT | web bundle | no licence file; package.json only |
| stats.js | 0.17.0 | MIT | MIT | web bundle | LICENSE reads as MIT |
| statuses | 2.0.2 | MIT | MIT | server runtime | LICENSE reads as MIT |
| std-env | 4.3.0 | MIT | MIT | dev/build | LICENCE reads as MIT |
| string-width | 4.2.3 | MIT | MIT | server runtime | license reads as MIT |
| strip-ansi | 6.0.1 | MIT | MIT | server runtime | license reads as MIT |
| suspend-react | 0.1.3 | MIT | MIT | web bundle | LICENSE reads as MIT |
| thread-stream | 4.2.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| three-mesh-bvh | 0.8.3 | MIT | MIT | web bundle | LICENSE reads as MIT |
| three-stdlib | 2.36.1 | MIT | MIT | web bundle | LICENSE reads as MIT |
| three | 0.186.1 | MIT | MIT | web bundle | LICENSE reads as MIT |
| tinybench | 6.2.0 | MIT | MIT | dev/build | LICENSE reads as MIT |
| tinyexec | 1.3.1 | MIT | MIT | dev/build | LICENSE reads as MIT |
| tinyglobby | 0.2.17 | MIT | MIT | dev/build | LICENSE reads as MIT |
| tinyrainbow | 3.2.0 | MIT | MIT | dev/build | LICENCE reads as MIT |
| toad-cache | 3.7.4 | MIT | MIT | server runtime | LICENSE reads as MIT |
| toidentifier | 1.0.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| troika-three-text | 0.52.5 | MIT | MIT | web bundle | LICENSE reads as MIT |
| troika-three-utils | 0.52.5 | MIT | MIT | web bundle | LICENSE reads as MIT |
| troika-worker-utils | 0.52.0 | MIT | MIT | web bundle | LICENSE reads as MIT |
| ts-algebra | 2.0.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| tsx | 4.23.15 | MIT | MIT | dev/build | LICENSE reads as MIT |
| tunnel-rat | 0.1.2 | MIT | MIT | web bundle | LICENSE reads as MIT |
| type-is | 2.1.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| typescript | 7.0.2 | Apache-2.0 | Apache-2.0 | dev/build | LICENSE reads as Apache-2.0 |
| undici-types | 8.9.0 | MIT | MIT | dev/build | LICENSE reads as MIT |
| unpipe | 1.0.0 | MIT | MIT | server runtime | LICENSE reads as MIT |
| use-sync-external-store | 1.7.0 | MIT | MIT | web bundle | LICENSE reads as MIT |
| utility-types | 3.11.0 | MIT | MIT | web bundle | LICENSE reads as MIT |
| vary | 1.1.2 | MIT | MIT | server runtime | LICENSE reads as MIT |
| vite | 8.3.2 | MIT | MIT | dev/build | LICENSE.md reads as Apache-2.0 + MIT |
| vitest | 5.0.3 | MIT | MIT | dev/build | LICENSE.md reads as MIT + BSD-3-Clause |
| webgl-constants | 1.1.1 | — | MIT | web bundle | recorded decision |
| webgl-sdf-generator | 1.1.1 | MIT | MIT | web bundle | LICENSE.txt reads as MIT |
| which-module | 2.0.1 | ISC | ISC | server runtime | LICENSE reads as ISC |
| which | 2.0.2 | ISC | ISC | web bundle, server runtime | LICENSE reads as ISC |
| why-is-node-running | 3.2.1 | MIT | MIT | dev/build | LICENSE reads as MIT |
| wrap-ansi | 6.2.0 | MIT | MIT | server runtime | license reads as MIT |
| wrappy | 1.0.2 | ISC | ISC | server runtime | LICENSE reads as ISC |
| y18n | 4.0.3 | ISC | ISC | server runtime | LICENSE reads as ISC |
| yargs-parser | 18.1.3 | ISC | ISC | server runtime | LICENSE.txt reads as ISC |
| yargs | 15.4.1 | MIT | MIT | server runtime | LICENSE reads as MIT |
| zod-to-json-schema | 3.25.2 | ISC | ISC | server runtime | LICENSE reads as ISC |
| zod | 4.6.5 | MIT | MIT | web bundle, server runtime | LICENSE reads as MIT |
| zustand | 4.5.7 | MIT | MIT | web bundle | LICENSE reads as MIT |
| zustand | 5.0.15 | MIT | MIT | web bundle | LICENSE reads as MIT |

<!-- END GENERATED: npm-inventory -->
