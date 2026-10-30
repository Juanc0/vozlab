#!/usr/bin/env bash
# docs-hygiene — repository documentation gate.
#
# Checks the four failure classes the committee found on 2026-10-29 and
# prevents their return:
#   1. broken relative links in live docs (everything except docs/archive/)
#   2. heredoc artifacts committed into files (`EOF` / `echo created` tails)
#   3. dead path references to moved trees (docs/spec, docs/tasks, docs/notes,
#      knowledge-transfer/, .claude/tasks, .claude/reviews) outside the archive
#   4. process documents left in the living set (docs/plans/*.md must be the
#      only open work docs; nothing named TASK-* outside archive/tasks)
#
# Run: bash scripts/docs-hygiene.sh   (exit 1 on any finding)
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
fail=0

echo "== 1. link integrity (live docs)"
python3 - <<'PY' || fail=1
import os, re, glob, sys
pat = re.compile(r'\[[^\]]*\]\(([^)\s]+)\)')
bad = []
files = [f for f in glob.glob('**/*.md', recursive=True)
         if 'node_modules' not in f and 'docs/archive' not in f
         and '/build/' not in f and '/.svelte-kit/' not in f and '.git/' not in f]
for f in files:
    base = os.path.dirname(f)
    for m in pat.finditer(open(f, errors='ignore').read()):
        l = m.group(1)
        if l.startswith(('http', '#', 'mailto')):
            continue
        l = l.split('#')[0]
        if not l:
            continue
        t = os.path.normpath(os.path.join(base, l))
        if not os.path.exists(t):
            bad.append(f'{f}: {m.group(1)}')
if bad:
    print('BROKEN LINKS:'); [print('  ', b) for b in sorted(set(bad))]
    sys.exit(1)
print('   all links resolve')
PY

echo "== 2. heredoc artifacts (unbalanced EOF terminators or stray tail)"
found2=0
while IFS= read -r f; do
  case "$f" in ./.agents/*|./.claude/*|./scripts/docs-hygiene.sh) continue;; esac
  opens=$(grep -cE "<<-?[[:space:]]*[\"']?EOF[\"']?" "$f")
  closes=$(grep -cE '^EOF$' "$f")
  if [ "$closes" -gt "$opens" ]; then echo "   UNBALANCED: $f (open=$opens close=$closes)"; found2=1; fail=1; continue; fi
  if tail -n 1 "$f" | grep -qE '^echo \\?"?created\\?"?$'; then echo "   STRAY TAIL: $f"; found2=1; fail=1; fi
done < <(grep -rl --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=build \
        --exclude-dir=.svelte-kit --exclude-dir=.agents --exclude-dir=.claude \
        -E '^EOF$|^echo \\?"?created\\?"?$' --include='*.md' --include='*.yml' \
        --include='*.ts' --include='*.py' --include='*.sh' . 2>/dev/null)
[ "$found2" -eq 0 ] && echo "   none"

echo "== 3. dead path references (outside the archive)"
DEAD='docs/spec/|docs/tasks/|docs/notes/|knowledge-transfer/|\.claude/tasks/|\.claude/reviews/|docs/runbook-dev\.md|docs/runbook-ops\.md|docs/runbook-demo-zrok\.md|docs/runbook-deploy\.md|docs/dns-domain-verification-design\.md|docs/auth-flow-oidc\.md|docs/identity-broker-comparison\.md|docs/authentik-vs-zitadel\.md'
refs=$(grep -rn --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=build --exclude-dir=.svelte-kit \
      --include='*.md' --include='*.ts' --include='*.py' --include='*.sh' --include='*.yml' --include='*.svelte' \
      -E "$DEAD" . | grep -v 'docs/archive/' | grep -v 'archive/' | grep -v 'scripts/docs-hygiene.sh' \
      | grep -viE 'migrated|carried|previously|formerly|was the|promoted|renamed|superseded' || true)
if [ -n "$refs" ]; then echo "DEAD REFS:"; echo "$refs" | sed 's/^/   /'; fail=1; else echo "   none"; fi

echo "== 4. process debris in the living set"
debris=$(find docs -maxdepth 1 -name 'TASK-*' -o -maxdepth 1 -name '*-status.md' -o -maxdepth 1 -name 'notes' -type d 2>/dev/null; \
         find docs/analysis -maxdepth 1 -name 'TASK-*' 2>/dev/null)
if [ -n "$debris" ]; then echo "DEBRIS:"; echo "$debris" | sed 's/^/   /'; fail=1; else echo "   none"; fi

if [ "$fail" -ne 0 ]; then
  echo "DOCS HYGIENE FAILED"; exit 1
fi
echo "DOCS HYGIENE OK"
