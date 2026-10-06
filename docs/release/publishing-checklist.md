# Publishing checklist

Steps to take, in order, to make the repository public as `github.com/haotool/aether-office`. Nothing here is automated
beyond the readiness check: pushing and changing GitHub settings stay manual decisions. The history work is described in
[Cleaning the history before publishing](history-cleanup.md).

## 1. Prepare the repository

- [ ] Copy `.oss-private-patterns.example` to `.oss-private-patterns` and list your private strings.
- [ ] `pnpm install --frozen-lockfile && pnpm build`, then `pnpm run oss:check`. Fix every **FAIL**; read every **WARN**
      (shipped assets over 1 MB and documentation host names such as `office.lan` are expected).
- [ ] Decide the canonical author identity in `.mailmap` (a GitHub noreply address is
      `<id>+haotool@users.noreply.github.com`; the id is the `id` field of `https://api.github.com/users/haotool`).
- [ ] Update `CHANGELOG.md`: rename `[Unreleased]` to `[0.4.0] - <date>`, and set `version` in `package.json` to `0.4.0`.
- [ ] Run the full checks once: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build`,
      `pnpm exec playwright test`, `pnpm verify:clean`.
- [ ] Produce the software bill of materials that [development](../development.md#releasing) lists as a release gate.

## 2. Clean and verify the history

- [ ] Choose strategy A, B or C (decision table in [history-cleanup](history-cleanup.md#the-three-options)).
- [ ] `history-plan.mjs`, edit `plan.json`, `history-apply.sh --dry-run`, `history-apply.sh`.
- [ ] `history-verify.sh <clone> --plan <plan> --full` ends with `GO`.
- [ ] `pnpm run oss:check --history` on a checkout of the rewritten clone: no FAIL.
- [ ] Skim `git log --oneline` of the clone and the first and last commits of every milestone.

## 3. Create the repository

- [ ] Create `haotool/aether-office` **private** (no README, no license, no `.gitignore`: the push brings them).
- [ ] From the rewritten clone: `git remote add origin git@github.com:haotool/aether-office.git`, then
      `git push -u origin main`. Never push this working repository.
- [ ] Wait for CI (`check` and `commit-messages`) to pass on the pushed `main`.
- [ ] Set the description and topics (`ai-agents`, `claude-code`, `codex`, `mcp`, `threejs`, `local-first`), the website if any,
      and the default branch `main`. Turn off wiki and projects unless used.

## 4. Protect it

- [ ] Branch ruleset for `main`: require a pull request, one approving review with Code Owners (`.github/CODEOWNERS`),
      the status checks `check` and `commit-messages`, a linear history; block force pushes and deletion.
- [ ] Settings, Code security: enable **private vulnerability reporting** (`SECURITY.md` points reporters there),
      **secret scanning** and **push protection**, **Dependabot alerts** and **security updates**
      (`.github/dependabot.yml` already configures version updates).
- [ ] Settings, Actions: default workflow permissions read-only (the CI file already declares `contents: read`); require
      approval for workflows from first-time contributors.
- [ ] Optional: enable code scanning (CodeQL) and a `SECURITY.md` fallback address if you do not want to rely on GitHub
      alone.

## 5. Release

- [ ] Tag from the pushed `main`: `git tag -a v0.4.0 -m "v0.4.0"` and `git push origin v0.4.0`.
- [ ] Create the release from the `[0.4.0]` section of `CHANGELOG.md`; attach the SBOM. Mark it a pre-release if the
      verification ledger still lists blocked items.
- [ ] Optional: publish the documentation with GitHub Pages from `docs/` (it is plain Markdown) or leave it in the
      repository.

## 6. Legal and trust notes

- [ ] Upstream credit: `LICENSE` keeps the upstream copyright beside yours, `THIRD_PARTY_NOTICES.md` lists what is derived,
      and the upstream contributors' commits are in the history (strategies B and C) or named in the sync commit (A).
- [ ] Trademarks: Claude, Anthropic, OpenAI and Codex are marks of their owners. `THIRD_PARTY_NOTICES.md` says no
      endorsement is implied; add one line to the README saying the project is not affiliated with them. Do not use their
      names in the repository name, the logo or the release titles, and keep the provider marks in the UI as plain
      identification.
- [ ] `@anthropic-ai/claude-agent-sdk` is under Anthropic's own terms, not an open-source license; the notices say so.
- [ ] Search the pushed repository once for your private strings (GitHub code search) before making it public.

## 7. Go public and check

- [ ] Change the visibility to public.
- [ ] Clone it fresh on another machine and follow the README: `pnpm install --frozen-lockfile`, `pnpm demo`.
- [ ] Open the Security tab and confirm **Report a vulnerability** is offered; open the Issues "New issue" page and confirm the
      templates load.
- [ ] Keep this working repository until the published copy has been accepted; then archive it.
