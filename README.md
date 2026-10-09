# Alignment Incident Database

A public, source-linked record of **alignment incidents**: cases where AI systems behaved against the intent of their developers, deployers, or users. Examples are deception, sycophancy, reward hacking, shutdown resistance, and destructive autonomous actions.

Every factual claim links to a source. This repository is the source of truth, and the website is built from it on every merge.

> Status: early. See [PLAN.md](PLAN.md) for what is being built.

## Layout

```
schema/incident.schema.json   JSON Schema for one incident (field docs live here)
data/incidents/<id>.yaml      one file per incident
data/taxonomy/                controlled vocabularies: behaviors, models, organizations
scripts/validate.mjs          schema + cross-reference validation
```

## Adding an incident

1. Copy an existing file in `data/incidents/` to `YYYY-MM-short-slug.yaml` and set `id` to match.
2. Write atomic `claims`. Each one cites one or more entries in `sources`.
3. Use ids from `data/taxonomy/`. If a model, org, or behavior is missing, add it there in the same PR.
4. Run `npm install && npm run validate`.
5. Open a PR.

Editorial rules are in [CLAUDE.md](CLAUDE.md). Humans and agents follow the same rules.
