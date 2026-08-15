#!/bin/sh
# PostToolUse hook: format the file Claude just edited.
# Claude Code passes the tool call as JSON on stdin.
#
# POSIX sh, so it runs identically whether your login shell is zsh, bash, or
# anything else. Never exits non-zero: a formatting failure must not block the
# session.

set -u

payload=$(cat)

file_path=$(printf '%s' "$payload" | node -e '
  let s = "";
  process.stdin.on("data", d => s += d);
  process.stdin.on("end", () => {
    try {
      const j = JSON.parse(s);
      process.stdout.write(j?.tool_input?.file_path ?? "");
    } catch { process.stdout.write(""); }
  });
' 2>/dev/null) || exit 0

[ -z "$file_path" ] && exit 0
[ -f "$file_path" ] || exit 0

case "$file_path" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.json|*.css|*.md)
    # --no-install: use the local devDependency, never fetch from the registry
    npx --no-install prettier --write "$file_path" >/dev/null 2>&1
    ;;
  *.sql)
    # No SQL formatter wired up. Warn on the invariants that are easiest to
    # drop when hand-writing a migration. See CLAUDE.md.
    if grep -qiE 'rank[[:space:]]+text' "$file_path" \
       && ! grep -qiE 'rank[[:space:]]+text[[:space:]]+collate[[:space:]]+"C"' "$file_path"; then
      echo "kortex: a 'rank text' column in $file_path is missing COLLATE \"C\" - CLAUDE.md invariant 1" >&2
    fi
    if grep -qiE 'create[[:space:]]+unique[[:space:]]+index' "$file_path" \
       && grep -qiE 'parent_id|private_to' "$file_path" \
       && ! grep -qi 'nulls not distinct' "$file_path"; then
      echo "kortex: unique index over a nullable scope column in $file_path may need NULLS NOT DISTINCT - CLAUDE.md invariant 2" >&2
    fi
    ;;
esac

exit 0
