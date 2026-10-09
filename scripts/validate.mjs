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
};

const errors = [];
const err = (file, msg) => errors.push(`${file}: ${msg}`);

for (const b of behaviors) {
  if (b.parent && !taxonomy.behaviors.has(b.parent)) err("behaviors.yaml", `${b.id} has unknown parent ${b.parent}`);
}

const dir = join(root, "data/incidents");
const files = readdirSync(dir).filter((f) => f.endsWith(".yaml"));
const incidents = new Map();

for (const file of files) {
  const doc = parse(readFileSync(join(dir, file), "utf8"));
  if (!validate(doc)) {
    for (const e of validate.errors) err(file, `${e.instancePath || "/"} ${e.message}`);
    continue;
  }
  if (doc.id !== basename(file, ".yaml")) err(file, `id "${doc.id}" does not match filename`);
  if (!doc.id.startsWith(doc.date.slice(0, 7)) && doc.date.length >= 7) {
    // id prefix is fixed at creation; dates may be refined later, so only warn.
    console.warn(`warn ${file}: id prefix differs from date ${doc.date}`);
  }

  for (const m of doc.models) if (!taxonomy.models.has(m)) err(file, `unknown model "${m}" (add to data/taxonomy/models.yaml)`);
  for (const o of doc.organizations) if (!taxonomy.organizations.has(o.id)) err(file, `unknown organization "${o.id}"`);
  for (const b of doc.behaviors) if (!taxonomy.behaviors.has(b)) err(file, `unknown behavior "${b}"`);

  const sourceIds = doc.sources.map((s) => s.id);
  const dupes = sourceIds.filter((s, i) => sourceIds.indexOf(s) !== i);
  if (dupes.length) err(file, `duplicate source ids: ${dupes.join(", ")}`);
  const cited = new Set(doc.claims.flatMap((c) => c.sources));
  for (const c of cited) if (!sourceIds.includes(c)) err(file, `claim cites unknown source "${c}"`);
  for (const s of sourceIds) if (!cited.has(s)) err(file, `source "${s}" is not cited by any claim`);

  incidents.set(doc.id, doc);
}

for (const [id, doc] of incidents) {
  for (const r of doc.related ?? []) if (!incidents.has(r)) err(`${id}.yaml`, `related incident "${r}" does not exist`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  console.error(`\n${errors.length} error(s) in ${files.length} incident file(s)`);
  process.exit(1);
}
console.log(`OK: ${incidents.size} incidents valid`);
