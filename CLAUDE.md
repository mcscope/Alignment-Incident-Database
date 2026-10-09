# Editorial rules (for humans and agents)

This repo is a public database of AI alignment incidents. Accuracy matters more than coverage. A wrong record damages the credibility of every other record.

## Sourcing
- Every factual statement in an incident must be a `claim` that cites at least one source the author **actually read**. Never cite a URL you have not fetched.
- The `summary` only restates claims. It adds no new facts.
- Prefer primary sources: the developer's or deployer's own statement, the research paper or system card, or the affected person's own post. Add news coverage as secondary support.
- Attribute disputed or one-sided accounts in the claim text ("Lemkin said the agent…"), not as fact.
- Numbers, dates, and quotes must match the source exactly. If sources conflict, say so in the claim, or leave the detail out and record it in `record.notes`.
- Use the least date precision you can source (`YYYY-MM` is fine).

## Neutral framing
- Titles describe what happened. No sensational language and no speculation about intent beyond what sources state.
- Distinguish lab/research findings (`setting: research | evaluation | red-team`) from real deployments (`setting: deployment`). Never imply a lab result happened in the wild.
- `harm` is about real harm that occurred, not potential harm.

## Records
- `id` = filename = `YYYY-MM-slug`. It never changes once merged, even if the date is later corrected.
- Before creating an incident, search `data/incidents/` for an existing one, matching by title, models, and source URLs. If you find one, extend it instead of duplicating it.
- Agent-created or agent-edited records set `record.created_by: agent` and `record.review_status: draft`. Only a human sets `reviewed`.
- Update `record.updated` on every edit.
- Add new taxonomy terms only when no existing term fits. Put them in the same PR.

## Workflow
- Run `npm run validate` before committing. CI runs it on every PR.
- Agents open PRs and never push to `main`. One incident per PR.
