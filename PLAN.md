# Build Plan

A public, source-linked database of alignment incidents: cases where AI systems behaved against the intent of their developers, deployers, or users. GitHub is the source of truth. Every merge to `main` redeploys the site, and an agent keeps the data current by opening PRs.

```
          ┌──────────────────────┐   opens PRs    ┌──────────────────────────┐
 news ───▶│  Scout agent (cron)  │──────────────▶ │  GitHub repo (truth)     │
          │  GitHub Action       │                │  data/incidents/*.yaml   │
          └──────────────────────┘                │  data/taxonomy/*.yaml    │
                                                  └──────────┬───────────────┘
                    humans review + merge  ───────────────── │ push to main
                                                             ▼
                                         ┌──────────────────────────────────┐
                                         │ CI: validate → build Astro site  │
                                         │ → deploy (GitHub Pages)          │
                                         └──────────────────────────────────┘
```

## Guiding principles

1. **Every claim has a source.** An incident is a set of atomic `claims`, and each one cites a source. The summary only restates claims.
2. **Separate what happened from where it happened.** A blackmail rate in a contrived lab eval and a coding agent deleting a real database are different kinds of events. `setting` and `harm` keep them apart, so the site never mixes them by accident.
3. **Agents propose and humans merge.** The agent never pushes to `main`. Agent-created records start as `review_status: draft` until a maintainer has checked every claim.
4. **Plain files, boring tools.** YAML in git, JSON Schema, and a static site. Anyone can contribute with a text editor.

---

## 1. Data format: first pass done ✅

| Path | What |
|---|---|
| `schema/incident.schema.json` | JSON Schema for one incident: field definitions, enums, and the rubric for each enum value |
| `data/incidents/<id>.yaml` | One file per incident. `id` = filename = `YYYY-MM-slug` and never changes |
| `data/taxonomy/behaviors.yaml` | Controlled vocabulary of behaviors (deception, sycophancy, shutdown-resistance, …), with optional `parent` |
| `data/taxonomy/models.yaml` | Models, each linked to its developer org and a `family` for grouping |
| `data/taxonomy/organizations.yaml` | Orgs, each with a type. Incidents reference them with a **role** (developer / deployer / researcher / reporter / affected) |
| `scripts/validate.mjs` | Schema check plus cross-file checks: taxonomy ids exist, every cited source exists, every source is cited, `related` ids exist |

The key fields of an incident are `status` (confirmed / reported / disputed / retracted), `setting` (deployment / evaluation / research / red-team), `harm` (none … severe, for harm that actually happened), `claims[]` → `sources[]`, `external_refs` (AI Incident Database number, OECD), and `record` (created_by human/agent, review_status).

**Open format questions (decide before the data gets large):**
- [ ] Do we want a long-form narrative field (Markdown with inline `[^source-id]` citations) in addition to atomic claims? Recommendation: add an optional `narrative` later and keep `claims` as the required core.
- [ ] Should `severity` or "alignment relevance" be separate from `harm`? A research result can matter a lot for alignment and still cause zero harm.
- [ ] Do we model one incident with many models (current approach, e.g. the multi-model blackmail study), or split per model?
- [ ] Inclusion criteria. Proposed: in scope are goal-directed misbehavior, deception, specification gaming, harmful autonomous actions, and sycophancy. Out of scope are plain hallucination, bias, and misuse by humans, unless the model's own behavior is the story. Write this up in `CONTRIBUTING.md`.

## 2. Seed data

- [x] 4 seed incidents, all `draft` (GPT-4o sycophancy, agentic-misalignment blackmail, Palisade shutdown resistance, Replit database deletion)
- [ ] Human review of the seeds. Their `record.notes` list the missing primary sources.
- [ ] Backfill about 50 well-known incidents (Bing/Sydney, CoastRunners and the classic spec-gaming list, o1 Apollo scheming evals, alignment-faking paper, emergent misalignment, Claude Opus 4 system card, Grok incidents, Air Canada chatbot, …). Agent-assisted: one PR per incident or per small batch.
- [ ] Use DeepMind's specification-gaming list and the AI Incident Database as backfill leads. Cross-link via `external_refs.aiid`.
- [ ] Archive every source URL to the Wayback Machine (`archive_url`). This can be automated (see §5).

## 3. Website

**Recommendation: [Astro](https://astro.build) static site** in `site/`. Content collections load the YAML directly. It ships zero JS by default and has small islands for filtering. Search uses [Pagefind](https://pagefind.app), which is static, so no server is needed.

Pages:
- [ ] `/` incident list: filter by behavior, model, organization, setting, status, harm, and year; sort by date
- [ ] `/incidents/<id>`: summary, claim list with numbered source citations, source list with archive links, metadata chips, related incidents, an "edit on GitHub" link, and a "suggest a correction" issue link
- [ ] `/behaviors/<id>`, `/models/<id>`, `/organizations/<id>`: index pages with descriptions and their incidents
- [ ] `/timeline`: incidents over time, colored by setting
- [ ] `/about`: scope, inclusion criteria, methodology, and how to contribute
- [ ] Machine-readable exports: `/data/incidents.json`, a CSV, and an RSS/Atom feed of new incidents
- [ ] Visible "Draft, not yet reviewed" badge on unreviewed records

## 4. Hosting and deploy

**Recommendation: GitHub Pages**, deployed by an Actions workflow on push to `main`. It's free and stays on one platform, and a custom domain can be added later. Cloudflare Pages is a fine alternative if we want PR preview deploys. The site is static, so switching later is cheap.

- [ ] `.github/workflows/deploy.yml`: on push to `main`, run validate → `astro build` → `actions/deploy-pages`
- [ ] (Optional) PR preview deploys so reviewers can see a new incident rendered
- [ ] Custom domain and HTTPS

## 5. Agentic GitHub Actions

All of these use [`anthropics/claude-code-action`](https://github.com/anthropics/claude-code-action) with `ANTHROPIC_API_KEY` in repo secrets. `CLAUDE.md` holds the shared editorial rules every agent follows.

- [ ] **Scout** (`scout.yml`, daily cron plus manual `workflow_dispatch`)
  - Searches news, arXiv, lab blogs and system cards, and AI-safety forums from the last ~48h for candidate incidents
  - Dedupes against existing incidents by id, title, and source URLs. If a candidate matches an existing incident, adds new sources/claims to it instead of creating a duplicate
  - Opens **one PR per incident**, labeled `agent-proposed`, with `review_status: draft`. The PR body lists the claims and the sources it read
  - Must pass `npm run validate`. Never pushes to `main`
  - Guardrails: cap PRs per run (e.g. 5), and restrict tool permissions to the repo plus web fetch/search
- [ ] **Link checker** (`links.yml`, weekly): checks every source URL, fills in missing `archive_url` via the Wayback Machine, and opens an issue for dead links
- [ ] **Issue → PR** (`on: issues` labeled `incident-report`): a public issue form ("report an incident") that the agent turns into a draft PR
- [ ] **PR reviewer** (`on: pull_request`): the agent checks that each claim is actually supported by its cited source and comments on any mismatch. This is a second pair of eyes for humans, not a gate

## 6. Repo and governance

- [ ] Create the GitHub repo (org or personal?) and push
- [ ] Branch protection on `main`: require PR plus the passing `Validate data` check
- [ ] `CONTRIBUTING.md`: inclusion criteria, how to add an incident, sourcing standards, and corrections policy
- [ ] Issue templates: report incident, correction, new taxonomy term
- [ ] Licenses: **CC BY 4.0** for data, **MIT** for code (to confirm)
- [ ] Code of conduct

## Suggested order

1. Review this format and the seeds → lock schema v1
2. Create the GitHub repo, branch protection, CI validate (already written)
3. Astro site MVP (list + incident page + filters) and Pages deploy
4. Backfill about 50 incidents (agent-assisted, human-reviewed)
5. Scout cron agent, link checker, issue-to-PR
6. Polish: timeline, search, exports, custom domain, launch
