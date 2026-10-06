#!/usr/bin/env bash
# Verifies a clone rewritten by history-apply.sh and prints a go/no-go summary. Read-only apart from `git gc` in the
# clone; it refuses any directory that history-apply did not create.
#
#   scripts/oss/history-verify.sh <clone> --plan plan.json [--private-patterns <file>] [--full] [--skip-install]
#
# Checks: tip tree vs source, upstream authorship, root commits, subject length, .git size after gc --aggressive,
# gitleaks, the readiness check over the whole history, then pnpm install --frozen-lockfile --offline, typecheck and a
# quick vitest subset on a checkout of the tip (--full runs the whole suite). Set NODE and PNPM when they are not on PATH
# (PNPM may be a command line such as "node /path/to/corepack pnpm").
set -euo pipefail

usage() {
  sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
node_bin=${NODE:-node}
read -r -a pnpm <<<"${PNPM:-pnpm}"
tools() { "$node_bin" "$here/history-tools.mjs" "$@"; }
in_checkout() { (cd "$checkout" && "$@"); }

clone="" plan="" private="" full=0 install=1 checkout=""
[ $# -ge 1 ] || usage
clone=$1
shift
while [ $# -gt 0 ]; do
  case "$1" in
    --plan) plan=${2:?}; shift 2 ;;
    --private-patterns) private=${2:?}; shift 2 ;;
    --full) full=1; shift ;;
    --skip-install) install=0; shift ;;
    *) usage ;;
  esac
done
[ -n "$plan" ] && [ -f "$plan" ] || { echo "--plan <plan.json> is required" >&2; exit 2; }
tools guard "$clone"

names=() states=()
record() { names+=("$1"); states+=("$2"); }
# step <name> <command...>: runs, prints the tail on failure, records PASS or FAIL.
step() {
  local name=$1 log
  shift
  log=$(mktemp)
  if "$@" >"$log" 2>&1; then
    record "$name" PASS
  else
    record "$name" FAIL
    echo "---- $name failed:"
    tail -n 25 "$log"
  fi
  rm -f "$log"
}

echo "== structure (tip tree, upstream authorship, roots, subjects)"
if tools verify "$clone" "$plan"; then record "structure" PASS; else record "structure" FAIL; fi

echo "== size"
git -C "$clone" reflog expire --expire=now --all
git -C "$clone" gc --quiet --prune=now --aggressive
size_kb=$(du -sk "$clone" | cut -f1)
git -C "$clone" count-objects -vH | grep -E 'size-pack|in-pack'
echo "   $(git -C "$clone" rev-list --count main) commits, repository $((size_kb / 1024)) MB after gc --aggressive"
limit_mb=${OSS_MAX_REPO_MB:-100}
if [ $((size_kb / 1024)) -le "$limit_mb" ]; then record "repository size <= ${limit_mb} MB" PASS; else record "repository size <= ${limit_mb} MB" FAIL; fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
checkout="$work/checkout"
git clone --quiet --no-local --branch main "$clone" "$checkout"
git -C "$checkout" remote remove origin

emails=()
while IFS= read -r email; do emails+=(--maintainer-email "$email"); done < <("$node_bin" -e \
  'for (const e of JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).identity.maintainerEmails) console.log(e)' "$plan")
patterns=()
[ -z "$private" ] || patterns=(--private-patterns "$private")

if [ "$install" = 1 ]; then
  echo "== install, typecheck and tests on a checkout of the tip"
  step "pnpm install --frozen-lockfile --offline" in_checkout "${pnpm[@]}" install --frozen-lockfile --offline
  step "typecheck" in_checkout "${pnpm[@]}" typecheck
  if [ "$full" = 1 ]; then
    step "full test suite" in_checkout "${pnpm[@]}" test
  else
    subset=(tests/aether/kernel.test.ts)
    for extra in "$checkout"/tests/aether/oss-*.test.ts; do [ -e "$extra" ] && subset+=("tests/aether/$(basename "$extra")"); done
    step "vitest subset (${#subset[@]} files)" in_checkout "${pnpm[@]}" exec vitest run "${subset[@]}"
  fi
fi

echo "== readiness check over the whole history"
if "$node_bin" "$here/readiness-check.mjs" --root "$checkout" --history ${patterns[@]+"${patterns[@]}"} ${emails[@]+"${emails[@]}"}; then
  record "readiness check (history)" PASS
else
  record "readiness check (history)" FAIL
fi

echo
echo "== summary for $clone"
verdict=GO
for i in "${!names[@]}"; do
  printf '   %-4s %s\n' "${states[$i]}" "${names[$i]}"
  [ "${states[$i]}" = PASS ] || verdict=NO-GO
done
echo "== $verdict"
[ "$verdict" = GO ]
