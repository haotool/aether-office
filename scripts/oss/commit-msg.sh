#!/usr/bin/env bash
# Checks commit subjects and AI-tool trailers against .github/CONTRIBUTING.md. As a hook: ln -s ../../scripts/oss/commit-msg.sh
# .git/hooks/commit-msg; otherwise --subject "feat: add a thing" or --range origin/main..HEAD. Merge, revert-by-git and
# fixup commits are skipped.
set -euo pipefail

max=72
trailers="$(dirname "$(readlink -f "$0")")/tool-trailers.mjs"
pattern='^(feat|fix|refactor|perf|docs|test|chore|ci|build|style|revert)(\([a-z0-9,/._-]+\))?!?: [^ ]'

check() {
  local subject=$1
  case "$subject" in
    "Merge "* | 'Revert "'* | "fixup! "* | "squash! "*) return 0 ;;
  esac
  if [ "${#subject}" -gt "$max" ]; then
    echo "subject has ${#subject} characters (limit $max): $subject" >&2
    return 1
  fi
  if ! [[ $subject =~ $pattern ]]; then
    echo "subject does not start with '<type>: ' or '<type>(<scope>): ': $subject" >&2
    return 1
  fi
}

failed=0
case "${1:-}" in
  --subject)
    check "${2:?usage: --subject <text>}" || failed=1
    ;;
  --range)
    while IFS= read -r subject; do
      check "$subject" || failed=1
    done < <(git log --format=%s "${2:?usage: --range <rev-range>}")
    git log --format=%B%x00 "$2" | node "$trailers" || failed=1
    ;;
  "")
    echo "usage: $0 <message-file> | --subject <text> | --range <rev-range>" >&2
    exit 2
    ;;
  *)
    subject=$(grep -v '^#' "$1" | head -n 1)
    check "$subject" || failed=1
    node "$trailers" "$1" || failed=1
    ;;
esac

if [ "$failed" = 1 ]; then
  echo "See .github/CONTRIBUTING.md, 'Commit messages and pull requests'." >&2
  exit 1
fi
