# Build Plan

A public, source-linked database of alignment incidents, modeled on **MITRE CVE**: permanent ids, sourced records, controlled vocabularies, and machine-readable exports. GitHub is the source of truth. Every merge to `main` redeploys the site, and a daily scout proposes new and updated records as PRs.

```
 feeds / APIs / X / pages           (software, deterministic, ~free)
        │  scout/collect.mjs    ──▶ candidates.json
        ▼
 Gemini Flash via OpenRouter        (cheap long-context aggregation)
        │  scout/aggregate.mjs  ──▶ digest.json: triage + clusters + matches
        ▼
 ┌────────────────── Scout agent (Claude, daily GitHub Action) ──────────┐
 │ Phase 1  Gather: verify-subagent per digest cluster, plus labs/web/    │
 │          legal/backfill lanes → findings/*.json                        │
 │ Phase 2  Edit: cluster, match existing AIDs, decide new/update/skip,   │
 │          re-verify every fact                                          │
 │ Phase 3  Publish: one PR per change (≤5/run), report to job summary    │
 └──────────────────────────────────────┬─────────────────────────────────┘
                                        ▼ PRs (draft records)
                           GitHub repo ── humans review + merge
                                        ▼ push to main
                       CI: validate → build site → deploy (GitHub Pages)
```

## Principles

1. **Every claim has a source.** Atomic `claims` cite sources. The `summary` and `writeup` only restate them, with inline `[@source]` citations.
2. **Facts and estimates are kept apart.** Sourced facts go in `claims` and `writeup`. Editorial judgment goes in `assessment` (reach, harm, money, criminality), and each estimate carries a rationale. The site labels estimates as estimates.
3. **Permanent ids.** `AID-<year assigned>-<seq>`, like CVE. Records are never deleted, only `retracted`.
4. **Agents propose and humans merge.** The agent never pushes to `main`. Agent records stay `draft` until a person has checked every claim.
5. **Software collects and agents judge.** Anything with a stable interface (feeds, APIs, page diffs) is fetched by code. LLMs are used for relevance, reading, clustering, writing, and estimates.

## Scope

- **In:** AI systems acting against the intent of their developers, deployers, or users, both in deployment and in published research, evals, or system cards.
- **In:** human misuse of AI at a **criminal** level.
- **Out:** hallucination on its own, sub-criminal misuse, and bias unless goal-directed behavior is the story.

---

## 1. Data format (v0.2) ✅

| Path | What |
|---|---|
| `schema/incident.schema.json` | JSON Schema with field docs and the rubric for every enum |
| `data/incidents/AID-YYYY-NNNN.yaml` | One file per incident |
| `data/taxonomy/{behaviors,models,organizations,harm_categories}.yaml` | Controlled vocabularies, which grow as incidents come in |
| `scripts/validate.mjs` | Schema plus cross-file rules: taxonomy ids exist, every source is cited, every paragraph of the writeup has a citation, human misuse is criminal-level, monetary ranges make sense, slugs are unique |
| `scripts/next-id.mjs` | Allocates the next AID, including ids already used in open PRs |

The incident fields:
- **Identity:** `id`, `slug`, `title`, `date`, `status` (confirmed / reported / disputed / retracted)
- **Who and what:** `actor` (model / human-misuse), `models`, `organizations` (each with a role), `behaviors`
- **Text:** `summary`, a short `writeup`, `claims[]` → `sources[]`
- **`assessment`** (editorial estimates):
  - `reach`: **speculative → internal → breakout → deployed**, plus an optional context
  - `harm`: severity plus categories
  - `monetary_damage`: a USD low/high range with confidence; null means unknown
  - `criminality`: none / unlikely / possible / likely / charged / convicted, plus offenses. For model behavior it asks "would this be a crime if a human did it?"
- **Other:** `related`, `tags`, `external_refs` (AIID, OECD), and `record` (created_by, review_status, notes)

Still to decide:
- [ ] The **AID prefix name** is a placeholder. Settle it before launch, because ids become permanent once public.
- [ ] Is a composite score worth adding, like CVSS for CVEs? This would be a single number combining reach, harm, and criminality for sorting. Probably later, once there are enough incidents to calibrate against.
- [ ] Should "alignment significance" be separate from harm? A lab result can matter a lot and cause no harm.
- [ ] Should one record cover a multi-model study (current approach), or should it be split per model?
- [ ] Should `models` support version or date pinning (like CVE "affected versions"), e.g. `gpt-4o@2025-04-25`?

## 2. Seed data

- [x] 4 seed records in v0.2 format, all `draft`
- [ ] Human review of the seeds. Their `record.notes` list the missing primary sources
- [ ] Backfill about 50 well-known incidents (Bing/Sydney, the classic spec-gaming list, o1/Apollo scheming, the alignment-faking paper, emergent misalignment, the Claude Opus 4 system card, Grok incidents, Air Canada, AI-enabled crimes with charges, …). The agent drafts them, one PR each.
- [ ] Cross-reference the AI Incident Database (`external_refs.aiid`)

## 3. Scout (data collection)

**Built:**
- `scout/sources.yaml`:
  - lab RSS feeds (OpenAI, Google DeepMind)
  - research feeds (METR, Palisade, Alignment Forum, LessWrong)
  - the AI Incident Database feed
  - Google News, Hacker News, arXiv, and X queries
  - watch pages (Anthropic news and research, xAI, Apollo, UK AISI)
  - agent web searches
- `scout/collect.mjs`: deterministic collector that writes `scout/out/candidates.json`. It drops items that are already cited. Tested locally: 27/27 sources responded and it returned 185 candidates.
- `scout/aggregate.mjs`: aggregation pass on **Gemini via OpenRouter** (`google/gemini-3.8-flash` by default; Gemini 4 isn't on OpenRouter as of 2026-10-09). It fetches article text, triages in batches of 40, then clusters and matches against existing records in a single long-context call. The output is leads only; Claude verifies everything. The model can be changed in `scout/sources.yaml` or the `SCOUT_AGG_MODEL` repo variable. Estimated cost is about $0.10/day.
- `scout/PROMPT.md`: three-phase agent (subagents verify digest clusters and cover the lanes software can't → editor decides → PRs)
- `.github/workflows/scout.yml`: runs daily at 13:00 UTC and on manual trigger, posts a job summary report, and keeps findings as an artifact

**Next: move more of the collection into software,** so agents spend tokens on judgment, not fetching:
- [ ] **Persistent "seen" state** so each item is triaged only once, not every day for 48h. Store it in a `scout-state` branch or the Actions cache.
- [ ] **Watch pages in code:** fetch HTML, extract post links, and diff them against seen state. This turns Anthropic, xAI, Apollo, and AISI into ordinary feeds.
- [ ] **Full-text fetch:** extract readable article text into `candidates.json`, so subagents start from text instead of re-fetching.
- [x] Cheap triage and clustering pre-pass (Gemini, `aggregate.mjs`)
- [ ] **Resolve Google News redirect URLs.** Today only about 8% of candidates get article text, because most are Google News JS redirects. Alternatives are a news API (e.g. GDELT or a paid one) or publishers' own RSS feeds.
- [ ] Measure triage quality: compare the digest's decisions with the decisions Claude overrides (the report has a section for this), then tune the prompt or model.
- [ ] **Archiving:** submit every new source URL to the Wayback Machine and record `archive_url`.
- [ ] More sources: Reddit (needs API credentials), Bluesky, court records (CourtListener API), lab system-card index pages, and additional Google News queries.

**Setup needed:**
- [ ] Repo secret `CLAUDE_CODE_OAUTH_TOKEN`: run `claude setup-token` locally (needs a Claude Pro/Max subscription). Runs count against the subscription.
- [ ] Repo secret `OPENROUTER_API_KEY`: for the aggregation pass. Without it, the step is skipped and Claude triages the raw candidates itself.
- [ ] Repo secret `SCOUT_GH_TOKEN`: a fine-grained PAT or GitHub App with contents and PR write access. Without it, scout PRs don't trigger the Validate check.
- [ ] Repo secret `X_BEARER_TOKEN`: X API access for recent search. This is a paid tier, so check current pricing. Without it, X coverage falls back to the agent's web searches.
- [ ] Watch costs for the first week. If they are too high, switch to a cheaper model, lower `--max-turns`, or add the pre-filter.

## 4. Website

**Recommendation: [Astro](https://astro.build)** static site in `site/`. Content collections read the YAML directly, and [Pagefind](https://pagefind.app) provides static search.

- [ ] `/`: incident list with filters for behavior, model, organization, reach, harm, criminality, status, and year
- [ ] `/AID-2026-0001` (canonical) and `/i/<slug>` (redirect): writeup with numbered citations, claims, sources and archive links, an assessment panel clearly labeled as estimates, and "edit on GitHub" and "report a correction" links
- [ ] `/behaviors/…`, `/models/…`, `/organizations/…` index pages
- [ ] `/timeline`, plus aggregate stats (estimated total damage and incidents by reach over time)
- [ ] `/about`: scope, methodology, assessment rubrics, and the id policy
- [ ] CVE-style exports: `/api/incidents.json`, a per-incident JSON file, CSV, and an Atom feed
- [ ] A "Draft, not yet reviewed" badge on unreviewed records

## 5. Hosting and deploy

**Recommendation: GitHub Pages**, deployed by Actions on push to `main`. Cloudflare Pages is the alternative if we want per-PR previews.

- [ ] `deploy.yml`: validate → `astro build` → `actions/deploy-pages`
- [ ] Custom domain

## 6. Other agent workflows

- [ ] **Link checker** (weekly): finds dead links, fills in archive URLs, and opens issues
- [ ] **Issue → PR**: a public "report an incident" issue form that the agent turns into a draft PR
- [ ] **PR source check**: the agent checks each claim against its cited source and comments on any mismatch

## 7. Governance

- [ ] Branch protection on `main`: require a PR and the passing `Validate data` check
- [ ] `CONTRIBUTING.md`, issue templates, and a code of conduct
- [ ] Licenses: CC BY 4.0 for data, MIT for code (to confirm)
- [ ] Corrections and retraction policy (like CVE's REJECTED/DISPUTED)

## Order

1. ~~Format v0.2, seeds, scout v1~~ ✅
2. Push to GitHub, add secrets and branch protection, trigger the scout manually and review its first PRs
3. Astro site MVP and Pages deploy
4. Backfill about 50 incidents
5. Move more collection into software (seen-state, page diffing, pre-filter)
6. Polish and launch
