#!/usr/bin/env bash
# Runs the full scout pipeline locally, the same as .github/workflows/scout.yml,
# except that nothing is pushed: each proposed change is committed to its own
# local branch, and the PR body that would have been used is saved to
# scout/out/prs/.
#
# The agent works in a separate git worktree, so your checkout is never touched.
#
#   scout/run-local.sh            collect + aggregate + agent
#   SCOUT_REUSE=1 scout/run-local.sh   reuse the existing scout/out/ (skip collect/aggregate)
#
# Needs: claude CLI logged in (or CLAUDE_CODE_OAUTH_TOKEN), OPENROUTER_API_KEY in .env.
set -euo pipefail

repo="$(git rev-parse --show-toplevel)"
cd "$repo"
[ -f .env ] && { set -a; . ./.env; set +a; }

stamp="$(date +%Y%m%d-%H%M)"
base="scout-run/$stamp"
wt="${SCOUT_WORKTREE:-$repo/.scout-worktrees/$stamp}"

git worktree add -q -b "$base" "$wt" HEAD
ln -s "$repo/node_modules" "$wt/node_modules"
mkdir -p "$wt/scout/out/findings" "$wt/scout/out/prs"
cd "$wt"

if [ "${SCOUT_REUSE:-}" = 1 ] && [ -f "$repo/scout/out/candidates.json" ]; then
  cp "$repo"/scout/out/{candidates,digest}.json "$wt/scout/out/" 2>/dev/null || true
  cp "$repo"/scout/out/digest.md "$wt/scout/out/" 2>/dev/null || true
  echo "reusing existing candidates/digest"
else
  npm run -s scout
  npm run -s aggregate || echo "aggregation failed; agent will triage raw candidates"
fi

prompt="Follow the instructions in scout/PROMPT.md. Repository: mcscope/Alignment-Incident-Database. Today is $(date +%Y-%m-%d).

LOCAL RUN. Overrides for Phase 3:
- The base branch is \`$base\`, not \`main\`. Use it wherever the instructions say main (\`main\` is checked out in another worktree).
- Do NOT run git push or gh. Instead, commit each change on its own local branch \`scout/<slug>\` created from \`$base\`, and write the PR body you would have used to scout/out/prs/<slug>.md.
- Everything else (subagents, verification, validation, report) is the same as production."

echo "agent running in $wt (log: $wt/scout/out/agent.log)"
claude -p "$prompt" \
  --model "${SCOUT_MODEL:-claude-opus-5-5}" \
  --output-format stream-json --verbose \
  --allowedTools "Agent,Task,Read,Write,Edit,Glob,Grep,WebSearch,WebFetch,Bash(npm run validate),Bash(npm run next-id:*),Bash(git checkout:*),Bash(git switch:*),Bash(git add:*),Bash(git commit:*),Bash(git status:*),Bash(git diff:*),Bash(git log:*),Bash(git branch:*),Bash(date:*),Bash(mkdir:*)" \
  > scout/out/agent.log 2>&1 || echo "agent exited non-zero"

echo
echo "=== Branches proposed ==="
git branch --list 'scout/*' --format='%(refname:short)  %(subject)'
echo
[ -f scout/out/report.md ] && cat scout/out/report.md
echo
echo "Worktree: $wt"
echo "Review a change:  git diff $base scout/<slug>"
echo "Clean up:         git worktree remove --force $wt && git branch -D $base \$(git branch --list 'scout/*' --format='%(refname:short)')"
