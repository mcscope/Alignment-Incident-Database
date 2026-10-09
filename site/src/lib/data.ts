// Build-time access to the database. Reads the same YAML files the validator
// checks, so the site never disagrees with the repo.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const root = process.cwd();
const load = (p: string) => parse(readFileSync(join(root, p), "utf8"));

export type Source = { id: string; url: string; title: string; publisher: string; published?: string; kind: string; archive_url?: string };
export type Claim = { text: string; sources: string[]; quote?: string };
export type Measurement = {
  id: string; label: string; condition?: string; source: string;
  unit: "percent" | "count" | "usd" | "ratio" | "hours" | "other"; unit_label?: string;
  values: { label: string; value: number; model?: string; n?: number; qualifier?: "=" | ">" | "<" | "~" }[];
};
export type Incident = {
  id: string; slug: string; title: string; date: string;
  status: "confirmed" | "reported" | "disputed" | "retracted";
  actor: "model" | "human-misuse";
  models: string[];
  organizations: { id: string; role: string }[];
  behaviors: string[];
  summary: string; writeup: string;
  claims: Claim[]; sources: Source[];
  measurements?: Measurement[];
  assessment: {
    reach: { level: "speculative" | "internal" | "breakout" | "deployed"; context?: string; rationale: string };
    harm: { severity: "none" | "minor" | "moderate" | "severe"; categories: string[]; rationale?: string };
    monetary_damage: { low_usd: number | null; high_usd: number | null; confidence: string; rationale: string };
    criminality: { likelihood: string; offenses?: string[]; jurisdiction?: string; rationale: string };
  };
  related?: string[]; tags?: string[];
  external_refs?: { aiid?: number; oecd_aim?: string };
  record: { created: string; updated: string; created_by: string; review_status: "draft" | "reviewed"; notes?: string };
};
export type Term = { id: string; name: string; description?: string; parent?: string; url?: string; type?: string; developer?: string | null; family?: string };

export const incidents: Incident[] = readdirSync(join(root, "data/incidents"))
  .filter((f) => f.endsWith(".yaml"))
  .map((f) => load(`data/incidents/${f}`) as Incident)
  .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

export const behaviors: Term[] = load("data/taxonomy/behaviors.yaml");
export const models: Term[] = load("data/taxonomy/models.yaml");
export const organizations: Term[] = load("data/taxonomy/organizations.yaml");
export const harmCategories: Term[] = load("data/taxonomy/harm_categories.yaml");
export const schema = load("schema/incident.schema.json");

const index = (terms: Term[]) => new Map(terms.map((t) => [t.id, t]));
export const behaviorById = index(behaviors);
export const modelById = index(models);
export const orgById = index(organizations);
export const harmById = index(harmCategories);
export const incidentById = new Map(incidents.map((i) => [i.id, i]));

export const orgIds = (i: Incident) => [...new Set(i.organizations.map((o) => o.id))];

// Ordered scales, used for display order and sorting.
export const REACH = ["speculative", "internal", "breakout", "deployed"] as const;
export const HARM = ["none", "minor", "moderate", "severe"] as const;
export const CRIMINALITY = ["none", "unlikely", "possible", "likely", "charged", "convicted"] as const;
export const STATUS = ["confirmed", "reported", "disputed", "retracted"] as const;

// Enum descriptions straight from the schema, so the site and the rubric can't drift.
const assessmentProps = schema.properties.assessment.properties;
export const rubric = {
  reach: assessmentProps.reach.properties.level.description as string,
  harm: assessmentProps.harm.properties.severity.description as string,
  monetary: assessmentProps.monetary_damage.description as string,
  criminality: assessmentProps.criminality.description as string,
  status: schema.properties.status.description as string,
  actor: schema.properties.actor.description as string,
};

export function formatUsd(n: number) {
  if (n >= 1e9) return `$${+(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${+(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${+(n / 1e3).toFixed(1)}K`;
  return `$${n}`;
}

export function formatDamage(m: Incident["assessment"]["monetary_damage"]) {
  if (m.low_usd === null || m.high_usd === null) return "Unknown";
  if (m.high_usd === 0) return "$0";
  if (m.low_usd === m.high_usd) return formatUsd(m.low_usd);
  return `${formatUsd(m.low_usd)} – ${formatUsd(m.high_usd)}`;
}

export function formatDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (!m) return String(y);
  if (!day) return `${months[m - 1]} ${y}`;
  return `${months[m - 1]} ${day}, ${y}`;
}

const base = import.meta.env.BASE_URL.replace(/\/$/, "");
export const url = (path: string) => `${base}${path}`;
export const repoUrl = "https://github.com/mcscope/Alignment-Incident-Database";
export const editUrl = (i: Incident) => `${repoUrl}/edit/main/data/incidents/${i.id}.yaml`;
export const correctionUrl = (i: Incident) =>
  `${repoUrl}/issues/new?title=${encodeURIComponent(`Correction: ${i.id}`)}&body=${encodeURIComponent(`Incident: ${i.id} (${i.title})\n\nWhat is wrong:\n\nSource showing the correct information:\n`)}`;

export function formatMeasure(m: Measurement, v: Measurement["values"][number]) {
  const q = v.qualifier && v.qualifier !== "=" ? `${v.qualifier === "~" ? "≈" : v.qualifier}` : "";
  const n = v.value;
  switch (m.unit) {
    case "percent": return `${q}${+n.toFixed(1)}%`;
    case "usd": return `${q}${formatUsd(n)}`;
    case "hours": return `${q}${n.toLocaleString("en-US")} h`;
    default: return `${q}${n.toLocaleString("en-US")}${m.unit_label && m.unit === "other" ? ` ${m.unit_label}` : ""}`;
  }
}

// ---------- Timeline helpers ----------

// Developers with their own color, in fixed palette order. Color follows the
// entity, never its rank, so adding incidents never repaints anyone. Everyone
// else is "Other". Past three colors, dots on one axis stop being reliably
// distinguishable for colorblind readers; the lane views give every developer a row.
export const DEV_COLORS = [
  { id: "openai", name: "OpenAI", color: "var(--dev-1)" },
  { id: "anthropic", name: "Anthropic", color: "var(--dev-2)" },
  { id: "google-deepmind", name: "Google DeepMind", color: "var(--dev-3)" },
] as const;

export function developers(i: Incident): string[] {
  const devs = new Set(i.organizations.filter((o) => o.role === "developer").map((o) => o.id));
  for (const m of i.models) {
    const d = modelById.get(m)?.developer;
    if (d) devs.add(d);
  }
  return [...devs];
}

/** "multiple" | one of DEV_COLORS ids | "other" (including undisclosed). */
export function devGroup(i: Incident) {
  const devs = developers(i);
  if (devs.length > 1) return "multiple";
  const d = devs[0];
  return DEV_COLORS.some((c) => c.id === d) ? d : "other";
}

export const HARM_RADIUS: Record<string, number> = { none: 5, minor: 7, moderate: 10, severe: 14 };

/** data-* attributes the home-page filters match on (shared by list rows and timeline dots). */
export function filterAttrs(i: Incident) {
  return {
    "data-search": [i.id, i.title, i.summary, ...i.models.map((m) => modelById.get(m)?.name ?? m), ...(i.tags ?? [])].join(" ").toLowerCase(),
    "data-behaviors": i.behaviors.join(" "),
    "data-models": i.models.join(" "),
    "data-orgs": orgIds(i).join(" "),
    "data-reach": i.assessment.reach.level,
    "data-harm": i.assessment.harm.severity,
    "data-crime": i.assessment.criminality.likelihood,
    "data-status": i.status,
    "data-actor": i.actor,
    "data-year": i.date.slice(0, 4),
  };
}
