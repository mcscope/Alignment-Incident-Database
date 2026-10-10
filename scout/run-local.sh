#!/usr/bin/env bash
# Runs the scout locally, the same as .github/workflows/scout.yml, in a separate
# git worktree so your checkout is untouched. The agent commits to a local
# branch instead of pushing; fast-forward main to it when you're happy.
#
#   scout/run-local.sh                 daily scan (collect + aggregate + agent)
#   SCOUT_MODE=backfill scout/run-local.sh   historical sweep (scout/BACKFILL.md)
#
# Needs: claude CLI logged in (or CLAUDE_CODE_OAUTH_TOKEN), OPENROUTER_API_KEY in .env.
set -euo pipefail

repo="$(git rev-parse --show-toplevel)"
cd "$repo"
[ -f .env ] && { set -a; . ./.env; set +a; }
# Never let the agent bill the API: with ANTHROPIC_API_KEY set, the claude CLI uses
# it instead of your logged-in subscription. Only the Gemini step needs .env keys.
unset ANTHROPIC_API_KEY

mode="${SCOUT_MODE:-daily}"
stamp="$(date +%Y%m%d-%H%M)"
branch="scout-run/$stamp"
wt="$repo/.scout-worktrees/$stamp"

git worktree add -q -b "$branch" "$wt" HEAD
ln -s "$repo/node_modules" "$wt/node_modules"
mkdir -p "$wt/scout/out/findings"
cd "$wt"

if [ "$mode" = daily ]; then
  npm run -s scout
  npm run -s aggregate || echo "aggregation failed; agent will triage raw candidates"
  instructions="scout/PROMPT.md"
else
  instructions="scout/BACKFILL.md"
fi

prompt="Follow the instructions in $instructions. Repository: mcscope/Alignment-Incident-Database. Today is $(date +%Y-%m-%d).

LOCAL RUN: work on the current branch \`$branch\` wherever the instructions say main, and do NOT run git pull or git push. Just commit."

tools="Agent,Task,Read,Write,Edit,Glob,Grep,WebSearch,WebFetch,Bash(npm run validate),Bash(npm run next-id:*),Bash(npm run write-incident:*),Bash(git add:*),Bash(git commit:*),Bash(git status:*),Bash(git diff:*),Bash(git log:*),Bash(date:*),Bash(mkdir:*)"
run_agent() {
  claude -p "$1" --model "${SCOUT_MODEL:-claude-opus-5-5}" --output-format stream-json --verbose \
    --allowedTools "$tools" >> scout/out/agent.log 2>&1
}

# 1. Subscription first (the logged-in claude CLI; ANTHROPIC_API_KEY is unset above).
echo "[$mode] agent running on subscription in $wt (log: $wt/scout/out/agent.log)"
if ! run_agent "$prompt" && grep -qiE "usage limit|hit your limit|limit reached" scout/out/agent.log; then
  # 2. Only if the subscription's usage limit was hit: retry via OpenRouter.
  if [ -n "${OPENROUTER_API_KEY:-}" ]; then
    echo "subscription usage limit hit; continuing via OpenRouter"
    ANTHROPIC_BASE_URL="https://openrouter.ai/api" ANTHROPIC_AUTH_TOKEN="$OPENROUTER_API_KEY" ANTHROPIC_API_KEY="" \
      run_agent "$prompt

Resume: a previous attempt stopped at a usage limit. Check git log and data/ for work already committed in this branch and continue from there." \
      || echo "agent exited non-zero"
  else
    echo "subscription usage limit hit and no OPENROUTER_API_KEY for fallback"
  fi
fi

echo
node scout/cost-report.mjs --claude scout/out/agent.log || true
echo
git log --oneline "$(git -C "$repo" rev-parse HEAD)..$branch"
[ -f scout/out/report.md ] && cat scout/out/report.md
echo
echo "Worktree: $wt"
echo "Publish:  git merge --ff-only $branch && git push"
