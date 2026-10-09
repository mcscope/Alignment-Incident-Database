// Validates every incident against the JSON Schema plus cross-file rules
// the schema can't express (taxonomy membership, source references, ids).
import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse } from "yaml";

const root = new URL("..", import.meta.url).pathname;
const load = (p) => parse(readFileSync(join(root, p), "utf8"));

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(load("schema/incident.schema.json"));

const ids = (list) => new Set(list.map((x) => x.id));
const behaviors = load("data/taxonomy/behaviors.yaml");
const taxonomy = {
  models: ids(load("data/taxonomy/models.yaml")),
  organizations: ids(load("data/taxonomy/organizations.yaml")),
  behaviors: ids(behaviors),
  harmCategories: ids(load("data/taxonomy/harm_categories.yaml")),
};

const errors = [];
const err = (file, msg) => errors.push(`${file}: ${msg}`);

for (const b of behaviors) {
  if (b.parent && !taxonomy.behaviors.has(b.parent)) err("behaviors.yaml", `${b.id} has unknown parent ${b.parent}`);
}

const dir = join(root, "data/incidents");
const files = readdirSync(dir).filter((f) => f.endsWith(".yaml"));
const incidents = new Map();
const slugs = new Map();

for (const file of files) {
  const doc = parse(readFileSync(join(dir, file), "utf8"));
  if (!validate(doc)) {
    for (const e of validate.errors) err(file, `${e.instancePath || "/"} ${e.message}`);
    continue;
  }
  if (doc.id !== basename(file, ".yaml")) err(file, `id "${doc.id}" does not match filename`);
  if (slugs.has(doc.slug)) err(file, `slug "${doc.slug}" also used by ${slugs.get(doc.slug)}`);
  slugs.set(doc.slug, doc.id);

  for (const m of doc.models) if (!taxonomy.models.has(m)) err(file, `unknown model "${m}" (add to data/taxonomy/models.yaml)`);
  for (const o of doc.organizations) if (!taxonomy.organizations.has(o.id)) err(file, `unknown organization "${o.id}"`);
  for (const b of doc.behaviors) if (!taxonomy.behaviors.has(b)) err(file, `unknown behavior "${b}"`);

  const sourceIds = doc.sources.map((s) => s.id);
  const dupes = sourceIds.filter((s, i) => sourceIds.indexOf(s) !== i);
  if (dupes.length) err(file, `duplicate source ids: ${dupes.join(", ")}`);
  for (const h of doc.assessment.harm.categories) if (!taxonomy.harmCategories.has(h)) err(file, `unknown harm category "${h}"`);
  const { severity, categories } = doc.assessment.harm;
  if (severity === "none" && categories.length) err(file, "harm categories given but severity is none");
  if (severity !== "none" && !categories.length) err(file, "harm severity is not none but no categories given");

  const { low_usd, high_usd } = doc.assessment.monetary_damage;
  if ((low_usd === null) !== (high_usd === null)) err(file, "monetary_damage low_usd/high_usd must both be set or both be null");
  if (low_usd !== null && low_usd > high_usd) err(file, "monetary_damage low_usd > high_usd");

  if (doc.actor === "human-misuse" && ["none", "unlikely", "possible"].includes(doc.assessment.criminality.likelihood)) {
    err(file, "human-misuse incidents are only in scope at criminal level (criminality likely, charged, or convicted)");
  }

  // Write-up citations: [@source-id]. Every paragraph needs at least one.
  const writeupCites = [...doc.writeup.matchAll(/\[@([a-z0-9-]+)\]/g)].map((m) => m[1]);
  doc.writeup.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).forEach((para, i) => {
    if (!/\[@[a-z0-9-]+\]/.test(para)) err(file, `writeup paragraph ${i + 1} has no [@source] citation`);
  });

  const measurementIds = new Set();
  for (const m of doc.measurements ?? []) {
    if (measurementIds.has(m.id)) err(file, `duplicate measurement id "${m.id}"`);
    measurementIds.add(m.id);
    for (const v of m.values) if (v.model && !taxonomy.models.has(v.model)) err(file, `measurement "${m.id}": unknown model "${v.model}"`);
    if (m.unit === "percent" && m.values.some((v) => v.value < 0 || v.value > 100)) err(file, `measurement "${m.id}": percent out of range`);
  }

  const cited = new Set([...doc.claims.flatMap((c) => c.sources), ...writeupCites, ...(doc.measurements ?? []).map((m) => m.source)]);
  for (const c of cited) if (!sourceIds.includes(c)) err(file, `cites unknown source "${c}"`);
  for (const s of sourceIds) if (!cited.has(s)) err(file, `source "${s}" is not cited anywhere`);

  incidents.set(doc.id, doc);
}

for (const [id, doc] of incidents) {
  for (const r of doc.related ?? []) if (!incidents.has(r)) err(`${id}.yaml`, `related incident "${r}" does not exist`);
}

// Scan logs: data/scans/YYYY-MM-DD.yaml, the scout's daily bibliography.
const VERDICTS = new Set(["cited", "lead", "skipped", "rejected", "unreviewed"]);
const scansDir = join(root, "data/scans");
for (const file of readdirSync(scansDir).filter((f) => f.endsWith(".yaml"))) {
  const log = parse(readFileSync(join(scansDir, file), "utf8"));
  const where = `scans/${file}`;
  if (`${log?.date}.yaml` !== file) err(where, "date does not match filename");
  for (const [n, e] of (log?.scanned ?? []).entries()) {
    if (!e.url) err(where, `entry ${n + 1} has no url`);
    if (!VERDICTS.has(e.verdict)) err(where, `entry ${n + 1} has invalid verdict "${e.verdict}"`);
    if (e.verdict === "cited" && !incidents.has(e.incident)) err(where, `entry ${n + 1} cites unknown incident "${e.incident}"`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  console.error(`\n${errors.length} error(s) in ${files.length} incident file(s)`);
  process.exit(1);
}
console.log(`OK: ${incidents.size} incidents valid`);
