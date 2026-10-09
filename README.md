# Alignment Incident Database

A public, source-linked record of **alignment incidents**: cases where AI systems behaved against the intent of their developers, deployers, or users. Examples are deception, sycophancy, reward hacking, shutdown resistance, and destructive autonomous actions. Criminal-level human misuse of AI is also included.

Modeled on MITRE CVE: every incident gets a permanent id like `AID-2026-0004`.

Every factual claim links to a source. This repository is the source of truth, and the website is built from it on every merge.

> Status: early. See [PLAN.md](PLAN.md) for what is being built.

## Layout

```
schema/incident.schema.json   JSON Schema for one incident (field docs live here)
data/incidents/<id>.yaml      one file per incident (AID-YYYY-NNNN.yaml)
data/taxonomy/                controlled vocabularies: behaviors, models, organizations, harm categories
scripts/validate.mjs          schema + cross-reference validation
scripts/next-id.mjs           allocates the next AID id
scout/                        daily news scan: sources.yaml, collect.mjs, aggregate.mjs, PROMPT.md
site/                         Astro website (built from data/, deployed to GitHub Pages)
```

## Website

```
npm install
npm run dev      # http://localhost:4321/Alignment-Incident-Database/
npm run build    # validates data, then builds to dist/
```

## Adding an incident

1. Run `npm run next-id`. Copy an existing file in `data/incidents/` to `<that id>.yaml` and set `id` and `slug`.
2. Write atomic `claims`, each citing entries in `sources`, and a short `writeup` with inline `[@source-id]` citations.
3. Fill in the `assessment` estimates (reach, harm, monetary damage, criminality), each with a rationale.
4. Use ids from `data/taxonomy/`. If a model, org, or behavior is missing, add it there in the same PR.
5. Run `npm install && npm run validate`.
6. Open a PR.

Editorial rules are in [CLAUDE.md](CLAUDE.md). Humans and agents follow the same rules.
