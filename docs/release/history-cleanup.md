# Cleaning the history before publishing

[Documentation](../README.md) · [Project](../../README.md)

<details>
<summary>Contents</summary>

- [What the original history contained](#what-the-original-history-contained)
- [The three options](#the-three-options)
- [What the kit does](#what-the-kit-does)
- [Step by step](#step-by-step)
- [Measured on this repository](#measured-on-this-repository)
- [Milestone subjects](#milestone-subjects)
- [Rewriting after publication](#rewriting-after-publication)
- [Limits and residual risks](#limits-and-residual-risks)

</details>

> [!NOTE]
> Historical preparation record. Public `main` has since been cleaned and published. The measurements below describe
> pre-publication clones. Routine releases follow the [release checklist](publishing-checklist.md); another history
> rewrite requires a separate, explicit maintenance decision. The one rewrite made after publication is recorded in
> [Rewriting after publication](#rewriting-after-publication).

This page records the original problems, three cleanup strategies and the commands used to compare them. The tooling
lives in `scripts/oss/`; each rewrite operates on a disposable clone rather than the working repository.

## What the original history contained

Measured before publication with `pnpm run oss:check --history` on 931 commits (30 upstream, 901 maintainer, 102 merges):

| Problem                                                                                                                                             | Why it matters                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| About 450 MB for a single branch: every rebuild of the animals is kept (`.blend`, GLB, PNG; 517 old versions, 643 MB uncompressed)                  | A slow first clone, and GitHub warns above 100 MB per push |
| The `.blend` files embed the builder's absolute home path; a few historical files and commit messages name it                                       | Personal information in public, permanently                |
| One mailbox address on all 901 maintainer commits                                                                                                   | The maintainer may prefer a GitHub noreply address         |
| 456 maintainer subjects are longer than 72 characters (up to 502) and read as paragraphs                                                            | `git log --oneline`, blame and GitHub's UI truncate them   |
| 102 merge commits, 75 of them named `Merge branch 'worktree-agent-...'`                                                                             | Tool artifacts, no information                             |
| The first 30 commits belong to the upstream agent-office contributors (MIT)                                                                         | Their attribution must stay                                |
| 396 maintainer commits carry a `Co-authored-by` trailer and 142 a session link; 22 upstream commits carry 37 AI co-author lines and 2 session links | A maintainer decision (see `--drop-trailers`)              |

Secrets are not a problem: gitleaks reports only fixed fake values in test fixtures, which `.github/gitleaks.toml` allowlists.

## The three options

|                            | A. Fresh milestone history                                                                        | B. Cleaned history, commits kept                                                      | C. B plus our commits squashed into milestones                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Commits after              | 27 (1 upstream baseline + 26 milestones)                                                          | 930                                                                                   | 56 (30 upstream, the sync merge and 25 milestones)                                    |
| Repository size (measured) | 39 MB                                                                                             | 47 MB                                                                                 | 39 MB                                                                                 |
| Upstream commits           | One baseline commit; the other contributors are named in the sync commit's body                   | All 30 kept, authors and dates untouched, messages untouched except for AI tool lines | All 30 kept, authors and dates untouched, messages untouched except for AI tool lines |
| What you keep              | The final tree and a readable story                                                               | Every commit, `git blame` and `git bisect` at full resolution                         | Upstream detail, a readable story of our work                                         |
| What you lose              | Upstream commit detail (and `git shortlog` shows 2 authors, not 9); fine-grained blame and bisect | Nothing but the stripped binaries and the old subjects (kept in each body)            | Our fine-grained blame and bisect; the story is 25 steps                              |
| Hash changes               | Every hash                                                                                        | Every hash (the upstream root contains stripped binaries, so all descendants change)  | Every hash                                                                            |
| Subjects                   | Written by the plan, editable                                                                     | Shortened to 72, the original in the body; merges renamed                             | Written by the plan, editable; the body lists each original subject                   |
| Merge commits              | None                                                                                              | 102 kept (renamed)                                                                    | 1 (the upstream sync)                                                                 |
| Effort and risk            | Lowest to review, highest loss                                                                    | Highest volume to review, lowest loss                                                 | Middle; the milestone list is the one thing to review                                 |
| Choose it when             | You want a clean slate and the upstream list is credited in NOTICE                                | You value `git bisect` and the fine-grained record                                    | You want upstream intact and a history a newcomer can read                            |

All three keep the final tree **byte-identical** for every file that is not stripped or rewritten (checked by
`history-verify.sh`: 2402 of 2402 files on the measured tip) and none removes upstream credit from the repository: the
`LICENSE`, `docs/legal/THIRD_PARTY_NOTICES.md` and, for A, the baseline commit and the sync commit's contributor list. The upstream
baseline commit that `docs/legal/THIRD_PARTY_NOTICES.md` names (`665aeec`) stays valid because it points into the upstream
repository, not into this one.

C is the recommended default: it removes the noise and the personal data, keeps the people who are not us exactly as
they were, and gives a 25-step history that a new reader can follow. B is the conservative choice. A is the simplest
to read and the most lossy.

## What the kit does

| Script                                                   | Purpose                                                                                                                            |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/oss/readiness-check.mjs` (`pnpm run oss:check`) | Scans the tree and, with `--history`, the history. No network. Exit 1 on a failure                                                 |
| `scripts/oss/history-plan.mjs --strategy B\|C\|A`        | Writes `plan.json` and `plan.md`: commits kept, squashed or renamed, milestones, strip rules, identity                             |
| `scripts/oss/history-apply.sh --plan ... --out ...`      | Creates a fresh bare clone, applies the plan with `git filter-repo`, never touches the source. `--dry-run` prints what it would do |
| `scripts/oss/history-verify.sh <clone> --plan ...`       | Checks the result and prints go or no-go                                                                                           |
| `scripts/oss/commit-msg.sh`                              | The commit-subject and AI-tool-trailer check (hook, `--subject`, `--range`)                                                        |

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
- **Map identities** with a mailmap derived from the canonical identity; upstream authors are never listed in it.
- **Subjects**: strategy B shortens subjects to 72 characters at a clause boundary and moves the original into the body;
  merge commits become `chore: merge <topic>`. Strategies C and A write milestone subjects and bodies.

### Git LFS instead of dropping old versions

If old versions of the animals should stay reachable, move them to Git LFS instead of stripping them: run
`git lfs migrate import --include="*.glb,*.png,*.webp" --everything` in the clone _instead of_ the strip rules
(`--strip-blobs-with-ids` input is the only part that removes binaries; edit `plan.json` `strip.minBytes` to a huge value
to disable it). Costs: every contributor needs `git lfs install`, GitHub LFS storage and bandwidth are limited on free
accounts, and a mirror push needs `git lfs push --all`. The repository stays small, but the history is only as portable as
the LFS server. The kit does not automate this path.

## Step by step

Requirements: `git`, [`git-filter-repo`](https://github.com/newren/git-filter-repo) and, optionally,
[`gitleaks`](https://github.com/gitleaks/gitleaks). Where `node` is not on `PATH`, set `NODE=/path/to/node` for the shell
scripts; `PNPM="node /path/to/corepack pnpm"` does the same for `history-verify.sh`.

1. **Write your private patterns.** Copy `scripts/oss/private-patterns.example` to `.oss-private-patterns` (it is gitignored) and
   list the strings that must never be published: your account and host names, personal e-mail addresses, private paths.
   Generic patterns (home directories, host names, LAN addresses, tokens) are built in.

2. **Look at where you stand.**

   ```sh
   pnpm run oss:check --history
   ```

3. **Choose the canonical identity.** Pass `--canonical-name` and `--canonical-email` to the plan. To publish under a GitHub
   noreply address use `<id>+<login>@users.noreply.github.com` (the numeric ID is the `id` field of
   `https://api.github.com/users/<login>`, and the account must own the address). Without the flags the plan falls back to
   the first entry of a `.mailmap`, if the repository has one.

4. **Plan.** Pick one strategy. The plan is written to `plan.json` (the input) and `plan.md` (the readable version).

   ```sh
   node scripts/oss/history-plan.mjs --strategy C --out /tmp/oss/plan-c      # or B, or A
   ```

   `--target 24` sets the number of milestones for A and C, `--drop-trailers` removes `Co-Authored-By` and session-link
   trailers from maintainer commits and, from upstream commits, only the lines an AI tool added (session links and AI
   co-author trailers; human co-authors stay), `--maintainer-email` (repeatable) lists your identities (default: the author
   of `HEAD`).

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

On the source history (931 commits, a 450 MB single-branch clone), on an Apple-silicon laptop:

| Strategy | Plan | Apply | Commits                                               | Pack after `gc --aggressive` | Verify                                 |
| -------- | ---- | ----- | ----------------------------------------------------- | ---------------------------- | -------------------------------------- |
| B        | 3 s  | 20 s  | 931 to 930 (one became empty), 790 subjects rewritten | 46.7 MiB                     | 25 s with install, typecheck and tests |
| C        | 8 s  | 14 s  | 931 to 56, 25 milestones                              | 39.2 MiB                     | 19 s with install, typecheck and tests |
| A        | 8 s  | 17 s  | 931 to 27                                             | 39.1 MiB                     | 21 s with install, typecheck and tests |

Timings vary with the disk cache and the machine load. The apply step stripped `*.blend`, `evidence/` and 174 to 517
historical binary versions (200 to 675 MB uncompressed, depending on strategy: squashing first leaves fewer versions to
strip). Applying the same plan twice gives the same tip hash (checked for C), so the result is
reproducible and the plan can be reviewed instead of the output.

All three runs used `--canonical-email <id>+<login>@users.noreply.github.com --drop-trailers`: every maintainer commit
carries the noreply identity as author and committer, no maintainer commit keeps a trailer or a session link, no commit at
all keeps a session link or an AI co-author trailer (verify checks this), and verify says `GO`.

## Milestone subjects

For strategies C and A, `history-plan.mjs` groups the maintainer's commits by dynamic programming over the commit log (cut
where the subject keywords change, prefer day boundaries, keep groups near the same size). Each subject is the biggest
commit of its group, so it is a draft: it can end mid-phrase or be a test repair that headlines a group about something
else. `plan.md` also lists the next three biggest commits of every group. Rewrite the subjects and bodies in `plan.json`
before applying. The history published with this repository came from plan C with every subject and body written by hand:
a subject of at most 72 characters, a short paragraph on why the step happened, and its notable changes.

## Rewriting after publication

On 2026-10-22 every commit made after `v0.4.0`, on `main` and on one open pull-request branch, was rewritten once more.
Only metadata changed. Each commit keeps its tree, author date and subject, so the old and the new commit of every pair
differ by nothing but their messages and identities, blame and bisect keep their granularity, and the commits up to
`v0.4.0`, the tag and the evidence that names its commit keep their hashes.

- Messages: AI-tool trailers and the squash-merge scaffolding around them are removed. Seven squash bodies that were pull
  request descriptions are reduced to the explanation of the change; the descriptions stay on the pull request pages.
- Identity: `haotool` with the noreply address is author and committer of every commit that is not upstream's.
- Method: one `git commit-tree` per commit, in order, from a throwaway clone; nothing in the working repository is
  rewritten. Before the push the result was checked by tree equality for every commit, `pnpm run oss:check --history`,
  gitleaks, `git fsck` and `scripts/oss/commit-msg.sh --range`.
- Tag: `v0.4.1` was an immutable release and its tag could not be moved. The release and the tag were deleted, the name
  is gone for good, and `0.4.2` carries its changes ([Withdrawing a release](versioning.md#withdrawing-a-release)).
- Push: the rulesets were switched off for the minutes of the push and restored and read back in the same command chain.

GitHub still lists the old commits under `refs/pull/*` and in release attestations, and a rebase or squash merge writes the
GitHub login as committer. Neither can be changed from the repository.

## Limits and residual risks

- Rewriting is irreversible for the published copy. Keep this repository until the published one is accepted.
- Hashes in issues, notes and the changelog that point at old commits will not resolve in the new history.
- Text rules replace by pattern. A private string that is split across lines, encoded or embedded in a compressed
  file is not found: `oss:check --history` and gitleaks are the second line of defense, not a proof.
- Old commits may not build, because their older binary versions are gone.
- The kit cannot undo a push. Create the GitHub repository private, push, check, then change visibility.
