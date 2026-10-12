# Publishing checklist

Steps to take, in order, to make the repository public as `github.com/haotool/aether-office`. Nothing here is automated
beyond the readiness check: pushing and changing GitHub settings stay manual decisions. The history work is described in
[Cleaning the history before publishing](history-cleanup.md).

## 1. Prepare the repository

- [ ] Copy `scripts/oss/private-patterns.example` to `.oss-private-patterns` and list your private strings.
- [ ] `pnpm install --frozen-lockfile && pnpm build`, then `pnpm run oss:check`. Fix every **FAIL**; read every **WARN**
      (shipped assets over 1 MB and documentation host names such as `office.example` are expected).
- [ ] Decide the canonical author identity and pass it to `history-plan.mjs` as `--canonical-name` and `--canonical-email`
      (a GitHub noreply address is `<id>+<login>@users.noreply.github.com`; the id is the `id` field of
      `https://api.github.com/users/<login>` of the account that owns the address). This is the maintainer's decision: the
      tooling never chooses it.
- [ ] Confirm `.github/CODEOWNERS` (`* @s123104`): also a maintainer decision. It asks the owner to review every pull
      request. The branch ruleset in step 4 does not require that review while there is one maintainer, because a single
      owner cannot approve their own pull requests; require it once a second owner is listed here.
- [ ] `CHANGELOG.md` has the `[0.4.0] - 2026-10-13` entry above an empty `[Unreleased]`: change the date if the release day
      differs. The version is `0.4.0` in the root `package.json` and the seven workspace `package.json` files
      (`tests/aether/version.test.ts` fails if they differ). Runtime code reads it from the root file (`APP_VERSION` in
      `@aether/contracts`); the `v0.4` badge in `apps/web/src/features/shell-chrome/Sidebar.tsx` and the version in
      `.github/SECURITY.md` are written by hand.
- [ ] Run the full checks once: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build`,
      `pnpm exec playwright test`, `pnpm verify:clean`.
- [ ] Licence compliance gate (see [docs/legal](../legal/README.md)):
  - `pnpm run notices:check` passes (notices current, every package under an approved licence, every file in `REUSE.toml`);
  - `node scripts/oss/overlap-scan.mjs --refs <folder with the reference clones> --exclude mcp_agent_mail --exclude agents-office` reports no block
    that is not listed in [provenance](../legal/provenance.md#evidence-that-no-code-was-copied);
  - the [open items](../legal/inventory.md#open-items) are decided (provider marks, Claude authentication wording) and the
    decisions recorded;
  - `pnpm build` and check that `apps/web/dist` contains `LICENSE.txt` and `THIRD_PARTY_NOTICES.txt`.
- [ ] Produce the software bill of materials:
      `node scripts/oss/third-party-notices.mjs --sbom aether-office-0.4.0.cdx.json` (CycloneDX 1.5, shipped packages).

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
- [ ] Wait for CI (`check`, `commit-messages`, and `audit`) to pass on the pushed `main`.
- [ ] Set the description and topics (`ai-agents`, `claude-code`, `codex`, `mcp`, `threejs`, `local-first`), the website if any,
      and the default branch `main`. Turn off wiki and projects unless used.

## 4. Protect it

- [ ] Branch ruleset for `main`: require a pull request (no approving review while there is one maintainer; one review
      with Code Owners from `.github/CODEOWNERS` once there are two), the status checks `check`, `commit-messages`, and
      `audit`, a linear history; block force pushes and deletion; let repository admins bypass through a pull request only.
- [ ] Settings, Code security: enable **private vulnerability reporting** (`.github/SECURITY.md` points reporters there),
      **secret scanning** and **push protection**, **Dependabot alerts** and **security updates**
      (`.github/dependabot.yml` already configures version updates).
- [ ] Settings, Actions: default workflow permissions read-only (the CI file already declares `contents: read`); require
      approval for workflows from first-time contributors.
- [ ] Confirm code scanning runs: `.github/workflows/codeql.yml` is on `main` (advanced CodeQL setup). Add a `.github/SECURITY.md`
      fallback address if you do not want to rely on GitHub private vulnerability reporting alone.

## 5. Release

- [ ] Tag from the pushed `main`: `git tag -a v0.4.0 -m "v0.4.0"` and `git push origin v0.4.0`.
- [ ] Create the release from the `[0.4.0]` section of `CHANGELOG.md`; attach the SBOM. Mark it a pre-release if the
      verification ledger still lists blocked items.
- [ ] Provenance: the release is source only, so the evidence is the tag and the commit it points at. Check that the commit
      has a green `check` run, and sign the tag (`git tag -s`) if you have a signing key.
- [ ] Optional: publish the documentation with GitHub Pages from `docs/` (it is plain Markdown) or leave it in the
      repository.

## 6. Legal and trust notes

- [ ] Upstream credit: `LICENSE` keeps the upstream copyright beside yours, `NOTICE`, `REUSE.toml` and
      [provenance](../legal/provenance.md) list what is derived, and the upstream contributors' commits are in the history
      (strategies B and C) or named in the sync commit (A).
- [ ] Trademarks: Claude, Anthropic, OpenAI and Codex are marks of their owners. The README, `NOTICE` and Settings, About say
      the project is not affiliated with them. Do not use their names in the repository name, the logo or the release
      titles. The provider marks are small indicators only, never the logo ([trademarks](../legal/trademarks.md#provider-marks)).
- [ ] `@anthropic-ai/claude-agent-sdk` is under Anthropic's own terms, not an open-source license; the notices say so and
      the project never bundles it. These documents are not legal advice: have the open items reviewed if in doubt.
- [ ] Search the pushed repository once for your private strings (GitHub code search) before making it public.

## 7. Go public and check

- [ ] Change the visibility to public.
- [ ] Clone it fresh on another machine and follow the README: `pnpm install --frozen-lockfile`, `pnpm demo`.
- [ ] Open the Security tab and confirm **Report a vulnerability** is offered; open the Issues "New issue" page and confirm the
      templates load.
- [ ] On a real iPhone (Safari) and a real Android phone (Chrome), open the app over HTTPS, install it and
      [capture the performance report](../getting-started.md#capture-a-phone-performance-report). The numbers in
      [mobile performance](../quality/mobile-perf.md) come from a desktop browser, not from a phone.
- [ ] Turn on VoiceOver (iOS or macOS) or TalkBack (Android) and go through the office, Sessions and Settings: every control
      has a name, the skip link works, and dialogs keep focus and give it back. Automated checks (axe, landmarks) cannot say
      whether it reads well.
- [ ] Keep this working repository until the published copy has been accepted; then archive it.
