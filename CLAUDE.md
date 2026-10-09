# Editorial rules (for humans and agents)

This repo is a public database of AI alignment incidents, modeled on MITRE CVE: permanent ids, sourced records, and conservative editing. Accuracy matters more than coverage. A wrong record damages the credibility of every other record.

## Scope
- **In:** an AI system acting against the intent of its developers, deployers, or users. This counts in deployment and in published research, evals, or system cards.
- **In:** human misuse of AI at a **criminal** level where the AI's capability was **central and novel**: AI-run or agentic cyberattacks, fraud or extortion conducted by an AI system, models used to plan serious harm (`actor: human-misuse`, criminality `likely` or above).
- **Out:** routine cases where someone used a generator to make illegal content (AI-generated CSAM or deepfake arrests, AI-written scam texts, AI-music streaming fraud). These are real crimes, but they number in the thousands and other trackers cover them.
- **Out:** hallucination or factual errors on their own, sub-criminal misuse, and bias, unless goal-directed model behavior is the story.

## Sourcing
- Every factual statement in an incident must be a `claim` that cites at least one source the author **actually read**. Never cite a URL you have not fetched.
- The `summary` (1-2 sentences) and `writeup` (short form, 1-4 paragraphs) only restate sourced facts. In the writeup, cite inline with `[@source-id]`, at least once per paragraph.
- Prefer primary sources: the developer's or deployer's own statement, the research paper or system card, or the affected person's own post. Add news coverage as secondary support.
- Attribute disputed or one-sided accounts in the claim text ("Lemkin said the agent…"), not as fact.
- Numbers, dates, and quotes must match the source exactly. If sources conflict, say so in the claim, or leave the detail out and record it in `record.notes`.
- Capture quantitative findings in `measurements` (rates, counts, dollars, sample sizes), copied exactly from one cited source. The site charts them.
- Use the least date precision you can source (`YYYY-MM` is fine).

## Neutral framing
- Titles describe what happened. No sensational language and no speculation about intent beyond what sources state.
- Distinguish lab findings (`reach: internal`) from real deployments (`reach: deployed`). Never imply a lab result happened in the wild. Use `breakout` only when the behavior actually crossed a containment boundary, and `speculative` when no instance was directly observed.
- `assessment` holds editorial estimates: reach, harm, monetary damage, and criminality. Give each one an honest rationale grounded in the claims. Use null dollar figures rather than guessing. `harm` covers real harm that occurred, not potential harm. Criminality for `actor: model` asks "would this be a crime if a human did it?"

## Records
- `id` = filename = `AID-<year assigned>-<seq>` (CVE-style). Get one with `npm run next-id`. It is permanent and never reused. If a record turns out to be wrong, set `status: retracted` rather than deleting it. `slug` is the readable URL name and may change.
- Before creating an incident, search `data/incidents/` for an existing one, matching by title, models, and source URLs. If you find one, extend it instead of duplicating it.
- Agent-created or agent-edited records set `record.created_by: agent` and `record.review_status: draft`. Only a human sets `reviewed`.
- Update `record.updated` on every edit.
- Add new taxonomy terms only when no existing term fits. Put them in the same PR.

## Workflow
- Run `npm run validate` before committing. CI runs it on every PR.
- Agents open PRs and never push to `main`. One incident per PR.
