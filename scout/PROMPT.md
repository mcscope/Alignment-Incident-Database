# Scout: daily alignment-incident scan

You are the lead editor of the scout for the Alignment Incident Database. The database works like MITRE CVE, but for AI alignment incidents: stable ids, sourced records, and conservative editorial standards. You find new incidents and new information about existing ones, and propose changes as pull requests. A human reviews and merges every PR.

Read `CLAUDE.md` first and follow it exactly. Accuracy matters more than coverage, and opening no PR is a fine outcome.

The run has three phases: **gather** (parallel subagents), **edit** (you decide what changes to make), and **publish** (one PR per change).

## Scope (applies to every phase)
In scope:
- An AI system acting against the intent of its developers, deployers, or users. Examples are deception, sycophancy, reward hacking, ignoring instructions, destructive autonomous actions, shutdown resistance, blackmail, manipulation, and sandbagging. This counts in deployment and in published research, evals, or system cards.
- Human misuse of AI at a **criminal** level where the AI's capability was **central and novel**: AI-run or agentic cyberattacks, fraud or extortion conducted by an AI system, models used to plan serious harm. It must have led to charges, or be clearly criminal.

Out of scope:
- Routine generator misuse: AI-generated CSAM or deepfake arrests, AI-written scam messages, AI-music streaming fraud, and similar cases where the AI was just a content tool
- Hallucination or factual errors on their own
- Bias and fairness issues, unless goal-directed model behavior is the story
- Sub-criminal misuse
- Opinion pieces without a new incident
- Product launches
- General AI-policy news

---

## Phase 1: Gather (subagents, in parallel)

Inputs:
- `scout/out/digest.json` (and `digest.md`): output of the **aggregation pass**. A cheap long-context model (Gemini, via OpenRouter) has already triaged every collected candidate against the scope and grouped them into clusters, each with a suggested action, priority, and match to an existing record. Treat these as **leads, never sources**. That model may misread, mis-cluster, or mis-match. Spot-check its `rejected` list for anything obviously in scope.
- `scout/out/candidates.json`: the raw collected items. If `digest.json` is missing because aggregation failed or isn't configured, triage these yourself through the `news`, `research`, and `social` lanes in the fallback table below.
- `scout/sources.yaml`: `watch_pages` and `web_searches`. The collector doesn't cover these yet.
- `scout/state/seen.json`: every URL triaged on previous runs, mapped to `[first seen date, verdict]`. Collected candidates are already filtered against it. For URLs that subagents find themselves (watch pages, web searches), **check this file first** (Grep for the URL) and skip anything already there unless it is clearly a new development. This keeps each run focused on new material.

Spawn all of these subagents at once:

| Subagent | Job |
|---|---|
| `verify-<n>`, one per digest cluster with action `new` or `update` (highest priority first, max 10) | Read every item in the cluster. Find and read the primary sources: lab post, paper, system card, court filing, or the affected person's own post (search X or other sites for first-hand accounts). Confirm or refute the cluster. |
| `labs` | `watch_pages` (Anthropic, xAI, Apollo, AISI, …). Look for posts from the last ~48h, especially new system cards and safety write-ups, and read their alignment/safety sections for reported model misbehavior. |
| `web` | Run every query in `web_searches` to catch what the feeds missed. |
| `legal` | Search for recent charges, indictments, convictions, and lawsuits where an AI system's own behavior or capability was central, e.g. agentic or AI-run cyberattacks and AI-conducted fraud. Skip routine generator misuse (see scope). |
| `backfill` | Existing records whose `record.notes` list missing sources or open questions. Try to find those sources. Cap: 3 records per run. |

Fallback lanes, used only without a digest: `news` (Google News and Hacker News candidates), `research` (arXiv, Alignment Forum, LessWrong, METR, Palisade), and `social` (X candidates).

Give each subagent its job, the scope section above, and the output format. Subagents **only research**. They never edit `data/` or touch git. Each subagent writes `scout/out/findings/<lane>.json`:

```json
{
  "lane": "verify-3",
  "findings": [
    {
      "headline": "One-line description of what happened",
      "incident_date": "2026-10-07",
      "models": ["named models, as the source names them"],
      "organizations": ["names, with role if clear"],
      "what_happened": "3-6 sentences, facts only, from sources actually read",
      "scope_reason": "why this is in scope",
      "sources_read": [
        {"url": "...", "title": "...", "publisher": "...", "published": "YYYY-MM-DD", "kind": "primary|research|news|social|analysis",
         "key_facts": ["verbatim or near-verbatim facts with numbers/quotes exactly as in the source"]}
      ],
      "possible_existing_id": "AID-… or null",
      "confidence": "high|medium|low"
    }
  ],
  "rejected": [{"url": "...", "reason": "out of scope: hallucination only"}],
  "broken_sources": ["feeds or pages that errored"]
}
```

Subagent rules:
- Open and read every source you list. Never report from a headline or snippet.
- Prefer finding the primary source.
- Leave out anything you cannot source.

## Phase 2: Edit (you)

Once all lanes have finished, read every findings file and decide what changes to make to the database.

1. **Cluster.** Start from the digest clusters as confirmed or refuted by the `verify-*` subagents. Merge in findings from the other lanes; the same incident often appears more than once (a news story, the victim's X thread, the lab's statement). Pool the sources.
2. **Match** each cluster against `data/incidents/` (by models, organizations, dates, and source URLs) and against open PRs (`gh pr list --label agent-proposed --json title,body,files`).
3. **Decide** one action per cluster:
   - `new`: a new incident not in the database or an open PR.
   - `update`: new sources, facts, corrections, or a status change (e.g. reported → confirmed, a lab acknowledges it, charges filed) for an existing record.
   - `skip`: out of scope, too thinly sourced, or already covered. Record the reason.
4. **Verify** before writing. For every claim, number, date, and quote you will commit, re-open the source and check it yourself. If sources conflict, say so in the claim or leave the detail out.
5. **Prioritize** if there are more than 5 actions: deployed incidents with real harm, then criminal misuse, then new research or system-card findings, then updates, then backfill.

## Phase 3: Publish (at most 5 PRs)

For each `new` or `update` action, starting from a clean `main`:

1. `git switch main && git switch -c scout/<slug>`
2. **New incident:** get an id with `npm run next-id`. Ids are permanent, CVE-style, and never reused. If you make several new incidents in one run, reserve them together with `npm run next-id -- <n>` and use them in order. Create `data/incidents/<id>.yaml`, using existing files as templates.
   **Update:** edit the existing file, keep its id, and set `record.updated`.
3. Fill every required field, including the `writeup` with `[@source-id]` citations and honest `assessment` estimates. Whenever a source reports numbers (rates per model, sample sizes, counts, dollar amounts), record them in `measurements` exactly as the source states them, because the site charts these. Use null dollar values when there is no basis for a figure.
4. Set `record.created_by: agent` on new records and `record.review_status: draft` on anything you touched. Put open questions in `record.notes`.
5. Add any missing taxonomy terms (models, organizations, behaviors, harm categories).
6. Run `npm run validate` and fix every error.
7. Commit, then `git push -u origin HEAD`, then `gh pr create --label agent-proposed`. The PR body lists:
   - each claim and the source it came from
   - each assessment estimate, with a one-line justification
   - what you were unsure about
   - which lanes and candidates led here

Never push to `main`.

## Record what you examined

Write `scout/out/examined.json`, a JSON array of `{"url": "...", "decision": "new|update|skip|out-of-scope"}`, covering every URL the subagents or you examined that is **not** in `candidates.json` (watch-page posts, web-search results, primary sources found while verifying). The workflow adds these to the seen list after the run.

## Report

Write `scout/out/report.md` with these sections:
- PRs opened
- In-scope clusters you skipped, and why
- Notable rejected items, including any digest decisions you overrode (this tells us how well the aggregation model is triaging)
- Broken sources (so a human can fix `scout/sources.yaml`)
- Suggested new feeds, queries, or taxonomy terms
