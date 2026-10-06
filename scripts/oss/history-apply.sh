#!/usr/bin/env bash
# Applies a reviewed history-cleanup plan to a FRESH CLONE of this repository. The source repository is never
# modified: the script creates its own bare clone (git clone --no-local), refuses any other target, and checks that the
# source branch and HEAD are identical before and after.
#
#   scripts/oss/history-apply.sh --plan plan.json --out <dir> [--source <repo>] [--private-patterns <file>] [--dry-run]
#
# Needs git-filter-repo. Set NODE to a node binary when `node` is not on PATH.
set -euo pipefail

usage() {
  sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
node_bin=${NODE:-node}
tools() { "$node_bin" "$here/history-tools.mjs" "$@"; }

plan="" out="" source_repo="" private="" dry_run=0
while [ $# -gt 0 ]; do
  case "$1" in
    --plan) plan=${2:?}; shift 2 ;;
    --out) out=${2:?}; shift 2 ;;
    --source) source_repo=${2:?}; shift 2 ;;
    --private-patterns) private=${2:?}; shift 2 ;;
    --dry-run) dry_run=1; shift ;;
    *) usage ;;
  esac
done
[ -n "$plan" ] && [ -n "$out" ] || usage
[ -f "$plan" ] || { echo "plan not found: $plan" >&2; exit 2; }
source_repo=${source_repo:-$(git rev-parse --show-toplevel)}
if [ -z "$private" ] && [ -f "$source_repo/.oss-private-patterns" ]; then private="$source_repo/.oss-private-patterns"; fi

{ read -r ref; read -r commit; read -r strategy; } < <(tools plan-field "$plan" source.ref source.commit strategy)

# Refuse a target that could be a real checkout, and a plan that no longer matches the source branch.
tools guard-new "$out" "$source_repo"
if [ "$(git -C "$source_repo" rev-parse "refs/heads/$ref")" != "$commit" ]; then
  echo "refusing: $ref moved since the plan was written; run history-plan.mjs again" >&2
  exit 1
fi

echo "== history-apply: strategy $strategy, source $source_repo ($ref @ ${commit:0:12})"
tools describe "$plan" "$source_repo" "$private"
if [ "$dry_run" = 1 ]; then
  cat <<EOF
== dry run: nothing is created. A real run would:
   1. git clone --no-local --bare --single-branch --branch $ref $source_repo $out   (then drop remote origin)
   2. squash the maintainer's commits into the plan's milestones (strategies C and A), tip tree checked
   3. git filter-repo: strip paths and unused binary versions, rewrite paths/PII, mailmap, subjects
   4. gc, write $out/oss/report.json, confirm the source branch did not change
EOF
  exit 0
fi

git filter-repo --version >/dev/null 2>&1 || { echo "git-filter-repo is not installed" >&2; exit 1; }
started=$(date +%s)
refs_before=$(git -C "$source_repo" rev-parse "refs/heads/$ref" HEAD)

git clone --quiet --no-local --bare --single-branch --branch "$ref" --no-tags "$source_repo" "$out"
git -C "$out" remote remove origin
size_before=$(du -sk "$out" | cut -f1)
tools mark "$out" "$plan" "$source_repo"
git -C "$out" branch -m "$ref" main
git -C "$out" symbolic-ref HEAD refs/heads/main
tools guard "$out"

if [ "$strategy" != "B" ]; then
  echo "== squashing into milestones"
  new_tip=$(tools squash "$out" "$plan")
  echo "   new tip $new_tip, tree unchanged"
  git -C "$out" reflog expire --expire=now --all
  git -C "$out" gc --quiet --prune=now
fi

inputs="$out/oss"
echo "== preparing filter-repo inputs"
tools filter-inputs "$out" "$plan" "$inputs" "$private"
export OSS_RULES="$inputs/rules.json" OSS_MESSAGES="$inputs/messages.json"
args=(--force --refs refs/heads/main --invert-paths --paths-from-file "$inputs/paths.txt"
  --blob-callback "$(cat "$inputs/blob-callback.py")" --commit-callback "$(cat "$inputs/commit-callback.py")")
[ -s "$inputs/strip-blobs.txt" ] && args+=(--strip-blobs-with-ids "$inputs/strip-blobs.txt")
[ -s "$inputs/mailmap.txt" ] && args+=(--mailmap "$inputs/mailmap.txt")

echo "== git filter-repo"
git -C "$out" filter-repo "${args[@]}" 2>&1 | tail -n 4
git -C "$out" reflog expire --expire=now --all
git -C "$out" gc --quiet --prune=now --aggressive

refs_after=$(git -C "$source_repo" rev-parse "refs/heads/$ref" HEAD)
[ "$refs_before" = "$refs_after" ] || { echo "ERROR: the source branch changed" >&2; exit 1; }

commits_after=$(git -C "$out" rev-list --count main)
size_after=$(du -sk "$out" | cut -f1)
seconds=$(( $(date +%s) - started ))
printf '{"strategy":"%s","sourceCommit":"%s","commitsAfter":%s,"sizeBeforeKB":%s,"sizeAfterKB":%s,"seconds":%s}\n' \
  "$strategy" "$commit" "$commits_after" "$size_before" "$size_after" "$seconds" | tee "$out/oss/report.json"
echo "== done: $out (bare). Next: scripts/oss/history-verify.sh $out --plan $plan"
