# Licence policy

AETHER OFFICE is released under the MIT License. Everything it ships must be compatible with that, and everything it uses
must be used within its licence. This policy is enforced by `scripts/oss/third-party-notices.mjs` (the `ALLOWED`,
`CONDITIONAL`, `DENIED`, `EXCEPTIONS` and `APPROVED` tables there are the machine-readable copy of the lists below) and by
`scripts/oss/reuse-check.mjs`. It is engineering practice, not legal advice; when in doubt, ask the maintainer before merging.

## Licence lists

**Allowed** (no review needed; for a choice such as `MIT OR Apache-2.0` the first allowed option in this order is recorded):
MIT, MIT-0, ISC, 0BSD, BSD-2-Clause, BSD-3-Clause, Apache-2.0, BlueOak-1.0.0, Zlib, Unlicense, CC0-1.0, Python-2.0,
CC-BY-4.0 (data and documentation). `WITH LLVM-exception` and `WITH Classpath-exception-2.0` are accepted.

**Conditional** (allowed in development tools; a shipped package needs an entry in `APPROVED` with the reason):

| Licence    | Condition                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| MPL-2.0    | File-level copyleft. Use the files unmodified; if an MPL file is ever modified or shipped, its source must be offered under the MPL. Today only development tools (`axe-core`, `@axe-core/playwright`, `lightningcss`) are MPL, unmodified and not shipped. |
| CC-BY-3.0  | Attribution in the notices.                                                                                     |
| `LicenseRef-*` (proprietary terms) | Allowed only as a dependency the user installs, never copied into the repository or a build. The one case is `@anthropic-ai/claude-agent-sdk` (see below). |

**Denied** (the check fails, in development tools too): GPL, LGPL, AGPL, SSPL, BUSL, Elastic License, EUPL, OSL, RPL, CPAL,
Commons Clause, CC BY-NC / BY-SA / BY-ND, PolyForm (including Noncommercial), the JSON License, "ethical" licences
(Hippocratic and similar), Parity and Prosperity, and any licence with a rider that withholds rights from named parties.
Also denied: a package with no licence, `UNLICENSED`, or `SEE LICENSE IN ...` without a recorded decision.

A licence not on any list is treated as unknown and fails the check until it is added here (and in the script) by the
maintainer.

## Adding or updating a dependency

1. Prefer the standard library and code already in the repository; a new dependency needs a reason in the pull request.
2. `pnpm add` it, then run `pnpm run notices`. The script reads the new package's `package.json` and licence file and
   compares them (a file that says MIT while `package.json` says ISC fails).
3. If it fails: a denied licence means choose another package. An unknown or `SEE LICENSE IN` licence means read the terms,
   then either reject the package or record a decision in `EXCEPTIONS` (with the declared value, the licence that applies and
   a one-line note) and in this document. A conditional licence on a shipped package needs an `APPROVED` entry.
4. Commit the regenerated `THIRD_PARTY_NOTICES.md` and `docs/legal/inventory.md` with the dependency change. CI runs
   `pnpm run notices:check` and fails when they are stale.
5. Apache-2.0 packages with a NOTICE file: the generator reproduces it; nothing to do by hand.

## Code from other projects

- **Do not copy code, tests, schemas, prompts or documentation from another project** unless its licence is on the allowed
  list, and then keep its copyright and licence notice: name the source (repository, path, commit) in a comment at the top
  of the file, add the file to `REUSE.toml` with the original copyright, and add it to the "Code adapted from other
  projects" section of the generator's preamble (which writes `THIRD_PARTY_NOTICES.md`) and to [provenance](provenance.md).
- **Ideas are free; expression is not.** Reading a project to understand an approach and then writing your own code is
  fine whatever its licence. Do not keep the other project open beside your editor while writing the equivalent code, and
  do not reproduce its structure, names and comments line by line.
- Projects under AGPL, GPL, source-available, non-commercial or rider licences (among the studied projects: agent-teams-ai and
  claude-squad are AGPL-3.0; agents-office is PolyForm Noncommercial; mcp_agent_mail is MIT with a rider that excludes
  OpenAI and Anthropic) are **ideas only**; the two with restrictive riders are not to be opened at all.
- Before a release, `node scripts/oss/overlap-scan.mjs --refs <clones>` reports long verbatim overlaps with the reference
  clones; every block must be one listed in [provenance](provenance.md).

## AI-assisted contributions

Contributions written with an AI assistant are welcome and are held to the same rules: you are responsible for what you
submit. Do not ask an assistant to reproduce another project's code, and do not paste in code it produces that you
recognise (or suspect) as coming from a project with an incompatible licence. If an assistant produced a long block that
looks like library or project code, check where it comes from before committing it. By submitting a contribution you
certify that you have the right to submit it under the MIT License (see the sign-off below).

## Contributor sign-off

Contributions are accepted under the MIT License ("inbound = outbound"); there is no contributor licence agreement. The
project recommends the [Developer Certificate of Origin](https://developercertificate.org/) (`git commit -s`) as the
contributor's statement that they may submit the change. *Maintainer decision:* whether to require the sign-off in CI.

## Assets

Every image, model, texture, sound or font added to the repository needs a known origin and licence, recorded in
[provenance](provenance.md) and, if it is not the project's own MIT work, in `REUSE.toml`. Generated assets record the
generator and its inputs (the animals' `apps/web/public/assets/animals/*.json` manifests do). Do not add stock images,
fonts, HDR environments, meshes or textures from the web without a licence that allows redistribution (CC0 or CC BY with
attribution); do not use AI image generators for assets whose terms restrict output use.

## Trademarks

Use other companies' names in plain text to say what the project works with; do not use their logos, colours or names as
part of AETHER OFFICE's own branding. See [trademarks](trademarks.md).

## Generated code

Code generated by a third-party tool from that tool's schema (today: the Codex protocol bindings in
`packages/providers/generated`) is treated as derived from the tool's project and keeps its licence (Apache-2.0, recorded in
`REUSE.toml` and `NOTICE`). Keep it unmodified; regenerate rather than edit.

## File headers

Existing files carry no per-file licence header: `REUSE.toml` states the licence and copyright of every path. New source files
may start with `// SPDX-License-Identifier: MIT`; a file adapted from elsewhere must say so in its first comment and be
listed in `REUSE.toml`.
