# Cleaning the history before publishing

The repository is meant to be published as an open-source project. Its history is not ready for that as it stands. This
page explains what is wrong, the three ways to fix it, and the commands. The tooling is in `scripts/oss/`; it never changes
this repository: every rewrite runs on a throwaway clone that the scripts create themselves.

## What is wrong with the current history

Measured with `pnpm run oss:check --history` on 296 commits:

| Problem                                                                                                    | Why it matters                                               |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| About 433 MB for a single branch: every rebuild of the animals is kept (`.blend`, GLB, PNG; 517 old versions, 640 MB uncompressed) | A slow first clone, and GitHub warns above 100 MB per push   |
| The `.blend` files embed the builder's absolute home path; a few historical files and commit messages name it | Personal information in public, permanently                  |
| One author identity with a personal address on about 260 commits                                           | The maintainer may prefer a GitHub noreply address           |
| 203 maintainer subjects are longer than 72 characters (up to 500) and read as paragraphs                   | `git log --oneline`, blame and GitHub's UI truncate them     |
| 31 merge commits named `Merge branch 'worktree-agent-...'`                                                 | Tool artifacts, no information                               |
| The first 30 commits belong to the upstream agent-office contributors (MIT)                                | Their attribution must stay                                  |
| One commit carries a `Co-Authored-By` trailer                                                              | A maintainer decision (see `--drop-trailers`)                |

Secrets are not a problem: gitleaks reports only fixed fake values in test fixtures, which `.gitleaks.toml` allowlists.

## The three options

| | A. Fresh milestone history | B. Cleaned history, commits kept | C. B plus our commits squashed into milestones |
| --- | --- | --- | --- |
| Commits after | 26 (1 upstream baseline + 25 milestones) | 295 | 55 (30 upstream + 25 milestones) |
| Repository size (measured) | 37 MB | 42 MB | 37 MB |
| Upstream commits | One baseline commit; the other contributors are named in the sync commit's body | All 30 kept, authors, dates and messages untouched | All 30 kept, authors, dates and messages untouched |
| What you keep | The final tree and a readable story | Every commit, `git blame` and `git bisect` at full resolution | Upstream detail, a readable story of our work |
| What you lose | Upstream commit detail (and `git shortlog` shows 2 authors, not 9); fine-grained blame and bisect | Nothing but the stripped binaries and the old subjects (kept in each body) | Our fine-grained blame and bisect; the story is 25 steps |
| Hash changes | Every hash | Every hash (the upstream root contains stripped binaries, so all descendants change) | Every hash |
| Subjects | Written by the plan, editable | Shortened to 72, the original in the body; merges renamed | Written by the plan, editable; the body lists each original subject |
| Merge commits | None | 31 kept (renamed) | 1 (the upstream sync) |
| Effort and risk | Lowest to review, highest loss | Highest volume to review, lowest loss | Middle; the milestone list is the one thing to review |
| Choose it when | You want a clean slate and the upstream list is credited in NOTICE | You value `git bisect` and the fine-grained record | You want upstream intact and a history a newcomer can read |

All three keep the final tree **byte-identical** for every file that is not stripped or rewritten (checked by
`history-verify.sh`: 1943 of 1943 files on the measured tip) and none removes upstream credit from the repository: the
`LICENSE`, `THIRD_PARTY_NOTICES.md` and, for A, the baseline commit and the sync commit's contributor list. The upstream
baseline commit that `THIRD_PARTY_NOTICES.md` names (`665aeec`) stays valid because it points into the upstream
repository, not into this one.

C is the recommended default: it removes the noise and the personal data, keeps the people who are not us exactly as
they were, and gives a 25-step history that a new reader can follow. B is the conservative choice. A is the simplest
to read and the most lossy.

## What the kit does

| Script | Purpose |
| --- | --- |
| `scripts/oss/readiness-check.mjs` (`pnpm run oss:check`) | Scans the tree and, with `--history`, the history. No network. Exit 1 on a failure |
| `scripts/oss/history-plan.mjs --strategy B\|C\|A` | Writes `plan.json` and `plan.md`: commits kept, squashed or renamed, milestones, strip rules, identity |
| `scripts/oss/history-apply.sh --plan ... --out ...` | Creates a fresh bare clone, applies the plan with `git filter-repo`, never touches the source. `--dry-run` prints what it would do |
| `scripts/oss/history-verify.sh <clone> --plan ...` | Checks the result and prints go or no-go |
| `scripts/oss/commit-msg.sh` | The commit-subject convention check (hook, `--subject`, `--range`) |

Safety: the apply script clones with `git clone --no-local`, removes the `origin` remote, writes a marker file
(`oss-throwaway-clone.json`) and checks that the source branch and `HEAD` are unchanged when it finishes. The rewriting
steps and `history-verify.sh` refuse any directory without that marker, the current checkout, and a clone that still has an
`origin`. The plan is bound to a commit: if the branch moves, apply refuses until you plan again.

### What the rewrite changes

- **Strip paths** from every commit: `*.blend`, `*.blend1`, `evidence/`, `test-results/`, `playwright-report/`,
  `*.trace.zip`.
- **Strip binary versions that the tip does not use**: any `glb`, `png`, `jpg`, `webp`, `zip`, `mp4` ... of at least 200 KB, and
  any file of at least 2 MB, whose blob is not in the tip tree. The tip keeps its own versions, so the final tree is
  identical; an old commit that had a different version of an animal simply lacks that file. Old commits are therefore not
  guaranteed to build. This is the "plain re-add" variant: nothing is re-committed, the latest assets stay where they are.
- **Rewrite text** in text files and commit messages (binaries are never touched): home directories
  (`/Users/<name>`, `C:\Users\<name>`) become `/Users/dev` unless the name is a placeholder (`dev`, `a`, `sam`, ...), and every
  string from `.oss-private-patterns` becomes its replacement.
- **Map identities** with a mailmap derived from `.mailmap`; upstream authors are never listed in it.
- **Subjects**: strategy B shortens subjects to 72 characters at a clause boundary and moves the original into the body;
  merge commits become `chore: merge <topic>`. Strategies C and A write milestone subjects and bodies.

### Git LFS instead of dropping old versions

If old versions of the animals should stay reachable, move them to Git LFS instead of stripping them: run
`git lfs migrate import --include="*.glb,*.png,*.webp" --everything` in the clone *instead of* the strip rules
(`--strip-blobs-with-ids` input is the only part that removes binaries; edit `plan.json` `strip.minBytes` to a huge value
to disable it). Costs: every contributor needs `git lfs install`, GitHub LFS storage and bandwidth are limited on free
accounts, and a mirror push needs `git lfs push --all`. The repository stays small, but the history is only as portable as
the LFS server. The kit does not automate this path.

## Step by step

Requirements: `git`, [`git-filter-repo`](https://github.com/newren/git-filter-repo) and, optionally,
[`gitleaks`](https://github.com/gitleaks/gitleaks). Where `node` is not on `PATH`, set `NODE=/path/to/node` for the shell
scripts; `PNPM="node /path/to/corepack pnpm"` does the same for `history-verify.sh`.

1. **Write your private patterns.** Copy `.oss-private-patterns.example` to `.oss-private-patterns` (it is gitignored) and
   list the strings that must never be published: your account and host names, personal e-mail addresses, private paths.
   Generic patterns (home directories, host names, LAN addresses, tokens) are built in.

2. **Look at where you stand.**

   ```sh
   pnpm run oss:check --history
   ```

3. **Choose the canonical identity.** `.mailmap` names it. To publish under a GitHub noreply address, replace the
   `.mailmap` entry as its comment shows (the numeric ID is the `id` field of `https://api.github.com/users/haotool`) and
   commit it; the plan reads the first entry of `.mailmap` as the canonical identity. `--canonical-name` and
   `--canonical-email` override it for one run.

4. **Plan.** Pick one strategy. The plan is written to `plan.json` (the input) and `plan.md` (the readable version).

   ```sh
   node scripts/oss/history-plan.mjs --strategy C --out /tmp/oss/plan-c      # or B, or A
   ```

   `--target 24` sets the number of milestones for A and C, `--drop-trailers` removes `Co-Authored-By` and session-link
   trailers from maintainer commits, `--maintainer-email` (repeatable) lists your identities (default: the author of `HEAD`).

5. **Review and edit.** Read `plan.md`. In `plan.json` you can change any milestone's `subject` and `message`, or the strip
   rules. The plan is deterministic: the same repository and options always give the same plan.

6. **Dry run, then apply.** The dry run prints the numbers and creates nothing.

   ```sh
   scripts/oss/history-apply.sh --plan /tmp/oss/plan-c/plan.json --out /tmp/oss/clone-c --dry-run
   scripts/oss/history-apply.sh --plan /tmp/oss/plan-c/plan.json --out /tmp/oss/clone-c
   ```

7. **Verify.**

   ```sh
   scripts/oss/history-verify.sh /tmp/oss/clone-c --plan /tmp/oss/plan-c/plan.json            # quick subset
   scripts/oss/history-verify.sh /tmp/oss/clone-c --plan /tmp/oss/plan-c/plan.json --full     # whole test suite
   ```

   It checks that the tip tree is byte-identical to the source (listing stripped and rewritten files), that every upstream
   commit keeps its author, date and message (A: that every contributor is named), that there is one root commit, that
   subjects fit 72 characters, the repository size after `gc --aggressive` (`OSS_MAX_REPO_MB`, default 100), gitleaks over the
   history, the whole readiness check over the history, and `pnpm install --frozen-lockfile --offline`, `pnpm typecheck` and
   a vitest subset on a checkout of the tip. It ends with `GO` or `NO-GO`.

8. **Publish** the clone, not this repository, following the [publishing checklist](publishing-checklist.md).

The exact commands for each strategy differ only in `--strategy` and the directory names above.

## Measured on this repository

On the tip `c6d2a97` (296 commits, a 433 MB single-branch clone), on an Apple-silicon laptop:

| Strategy | Plan | Apply | Commits | Pack after `gc --aggressive` | Verify |
| --- | --- | --- | --- | --- | --- |
| B | 4 s | 52 s | 296 to 295 (one became empty), 234 subjects rewritten | 42.1 MiB | 78 s with install, typecheck and tests |
| C | 4 s | 77 s | 296 to 55, 25 milestones | 37.4 MiB | 74 s with install, typecheck and tests |
| A | 4 s | 79 s | 296 to 26 | 36.6 MiB | 30 s with `--skip-install` |

Timings vary with the disk cache (strategy C applied in 25 s on a warm second run). The apply step stripped `*.blend`,
`evidence/` and 256 to 517 historical binary versions (320 to 670 MB uncompressed, depending on strategy: squashing first
leaves fewer versions to strip). Applying the same plan twice gives the same tip hash (checked for C), so the result is
reproducible and the plan can be reviewed instead of the output.

Other runs on the same tip: strategy B with `--canonical-email 12345+haotool@users.noreply.github.com --drop-trailers`
(all 267 maintainer commits carry the noreply identity as author and committer, no trailer is left, verify says `GO`), and
strategy A with a full verify (`GO`).

## Milestones proposed for C

What `history-plan.mjs --strategy C` proposed on `c6d2a97`, after the 30 upstream commits are set aside. The groups are
chosen by dynamic programming over the commit log (cut where the subject keywords change, prefer day boundaries, keep
groups near the same size) and each subject is the biggest commit of its group; this is a draft for the maintainer to edit
in `plan.json`. `plan.md` also lists the next three biggest commits of every group.

| # | Dates (2026) | Commits | Proposed subject |
| --: | --- | --: | --- |
| 1 | 09-30 | 1 | upstream baseline commit, kept as it is |
| 2 | 10-03 | 8 | feat: Codex app-server and Claude adapters, hook installer |
| 3 | 10-03 | 1 | chore: sync upstream agent-office main (29 commits) into the AETHER fork (kept, two parents) |
| 4 | 10-03 | 6 | feat: attribute worktrees by Git common dir and subagents by hook events |
| 5 | 10-03 | 14 | feat: integrate job with serial gating |
| 6 | 10-03 | 9 | feat: wire carriers, tour, perf and notification controls into the app |
| 7 | 10-03 | 6 | feat: idempotent schedules that create unassigned work |
| 8 | 10-03 | 6 | feat: GitHub and Linear import with field ownership |
| 9 | 10-04 | 11 | feat: generic ACP client with negotiated capabilities |
| 10 | 10-04 | 12 | feat: workflow templates with enforced provider roles and dependency |
| 11 | 10-04 | 10 | test: accessibility sweep of every page in both themes and viewports |
| 12 | 10-04 | 5 | docs: record the 2026-10-04 convergence status and remaining blockers |
| 13 | 10-04 | 9 | feat: detect the running agent CLI process behind each session |
| 14 | 10-04 | 9 | feat: classify every session into an engineering role and department |
| 15 | 10-04 | 12 | feat: a five-floor building, one department per floor |
| 16 | 10-04 | 16 | feat: machine CPU, memory and free disk, per-session CPU and memory |
| 17 | 10-04 | 10 | fix: restore the original dependency-policy tests |
| 18 | 10-04 | 8 | feat: classify how alive each session |
| 19 | 10-04 | 8 | refactor: split the 1200-line contracts index by domain |
| 20 | 10-04 to 10-05 | 8 | feat: the camera directs itself |
| 21 | 10-05 | 12 | feat: design system |
| 22 | 10-05 | 16 | feat: sign a phone in by scanning a QR code |
| 23 | 10-06 | 22 | feat: a garden of genome-grown glass flowers and twig trees on the crown |
| 24 | 10-06 | 18 | feat: the panel beside the office is a live session feed |
| 25 | 10-06 | 22 | feat: direct interaction with the characters |
| 26 | 10-06 to 10-07 | 8 | test: cover the release kit with temporary repositories |

Weak spots a human should fix: #10 and #18 end mid-phrase, #17 is a test repair that headlines a group about animals and
dependency policy, and #26 is headed by the kit's own commits. Rename them in `plan.json` before applying.

## Limits and residual risks

- Rewriting is irreversible for the published copy. Keep this repository until the published one is accepted.
- Hashes in issues, notes and the changelog that point at old commits will not resolve in the new history.
- Text rules replace by pattern. A private string that is split across lines, encoded or embedded in a compressed
  file is not found: `oss:check --history` and gitleaks are the second line of defense, not a proof.
- Old commits may not build, because their older binary versions are gone.
- The kit cannot undo a push. Create the GitHub repository private, push, check, then change visibility.
