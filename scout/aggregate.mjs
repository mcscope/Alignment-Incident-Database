// Aggregation pass: turns scout/out/candidates.json into scout/out/digest.json
// using a cheap long-context model via OpenRouter (default: Gemini Flash).
//
//   1. fetch readable text for each candidate
//   2. triage in batches: in scope or not, per CLAUDE.md scope rules
//   3. cluster in-scope items into incidents and match them to existing records
//
// The digest is a list of *leads* for the Claude editor. Nothing in it is
// treated as a source; the editor re-reads and verifies everything.
//
// Env: OPENROUTER_API_KEY (required unless --dry-run), SCOUT_AGG_MODEL (optional).
// Flags: --dry-run  fetch text and build prompts, but don't call the model.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const root = new URL("..", import.meta.url).pathname;
const out = (f) => join(root, "scout/out", f);
const cfg = parse(readFileSync(join(root, "scout/sources.yaml"), "utf8"));
const MODEL = process.env.SCOUT_AGG_MODEL || cfg.aggregation?.model || "google/gemini-3.8-flash";
const BATCH = cfg.aggregation?.batch_size ?? 40;
const TEXT_CHARS = cfg.aggregation?.text_chars ?? 6000;
const dryRun = process.argv.includes("--dry-run");

if (!dryRun && !process.env.OPENROUTER_API_KEY) {
  console.warn("OPENROUTER_API_KEY not set; skipping aggregation (the agent will triage candidates.json itself)");
  process.exit(0);
}

const { candidates } = JSON.parse(readFileSync(out("candidates.json"), "utf8"));
const existing = readdirSync(join(root, "data/incidents"))
  .filter((f) => f.endsWith(".yaml"))
  .map((f) => {
    const d = parse(readFileSync(join(root, "data/incidents", f), "utf8"));
    return { id: d.id, title: d.title, date: d.date, models: d.models, sources: d.sources.map((s) => s.url) };
  });

// --- 1. Fetch readable text --------------------------------------------------

function htmlToText(html) {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(url) {
  // Google News RSS links are JS redirects; title + snippet is all we get cheaply.
  if (/news\.google\.com\/rss\/articles/.test(url)) return null;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (AlignmentIncidentDatabase-scout)" },
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
    });
    if (!res.ok || !/text\/html|xml|text\/plain/.test(res.headers.get("content-type") ?? "")) return null;
    return htmlToText(await res.text()).slice(0, TEXT_CHARS);
  } catch {
    return null;
  }
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }));
  return results;
}

const texts = await mapLimit(candidates, 8, (c) => fetchText(c.url));
const items = candidates.map((c, i) => ({ idx: i, ...c, text: texts[i] }));
console.log(`fetched text for ${texts.filter(Boolean).length}/${items.length} candidates`);

// --- Model calls -------------------------------------------------------------

const SCOPE = `
IN SCOPE ("alignment incidents"):
- An AI system acting against the intent of its developers, deployers, or users: deception, sycophancy,
  reward hacking/specification gaming, ignoring explicit instructions, destructive autonomous actions,
  shutdown resistance, self-preservation, blackmail, manipulation, sandbagging, alignment faking,
  emergent misalignment, harmful advice to vulnerable users. Counts in real deployments AND in
  published research, evaluations, or system cards.
- Human misuse of AI at a CRIMINAL level where the AI's capability was CENTRAL and NOVEL: AI-run or
  agentic cyberattacks, fraud or extortion conducted by an AI system, models used to plan serious harm.
OUT OF SCOPE: hallucination or factual errors alone; bias/fairness unless goal-directed behavior is the
story; sub-criminal misuse; opinion/commentary without a new incident; product launches; general AI
policy or funding news; ordinary crime where AI is incidental; ROUTINE GENERATOR MISUSE such as
AI-generated CSAM or deepfake arrests, AI-written scam texts, or AI-music streaming fraud.`;

async function complete(name, system, user, schema) {
  if (dryRun) {
    writeFileSync(out(`prompt-${name}.txt`), `${system}\n\n---\n\n${user}`);
    return null;
  }
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/mcscope/Alignment-Incident-Database",
        "X-Title": "Alignment Incident Database scout",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 32000,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
        provider: { require_parameters: true },
      }),
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
    const body = await res.json();
    usage.prompt += body.usage?.prompt_tokens ?? 0;
    usage.completion += body.usage?.completion_tokens ?? 0;
    const choice = body.choices?.[0];
    try {
      return JSON.parse(choice.message.content);
    } catch (e) {
      console.warn(`${name}: unparseable response (finish_reason=${choice?.finish_reason}, attempt ${attempt}): ${e.message}`);
    }
  }
  console.warn(`${name}: giving up; its items will be missing from the digest`);
  failures.push(name);
  return null;
}
const failures = [];
const usage = { prompt: 0, completion: 0 };

const obj = (properties) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const str = { type: "string" };

// --- 2. Triage ---------------------------------------------------------------

const triageSchema = obj({
  items: {
    type: "array",
    items: obj({
      idx: { type: "integer" },
      in_scope: { type: "boolean" },
      actor: { type: "string", enum: ["model", "human-misuse", "n/a"] },
      reason: str,
    }),
  },
});

const triageSystem = `You triage news and research items for the Alignment Incident Database, a CVE-like public
record of AI alignment incidents. Decide for EVERY item whether it plausibly reports an in-scope incident.
${SCOPE}
Be inclusive of borderline items that may be in scope (a later, more careful editor verifies), but reject
clear noise. Base decisions only on the given title/snippet/text. Keep each reason under 15 words.`;

const render = (it) =>
  `### [${it.idx}] ${it.title}\norigin: ${it.origin} | published: ${it.published ?? "?"} | url: ${it.url}\n` +
  `snippet: ${it.snippet || "-"}\n${it.text ? `text: ${it.text}` : "(no article text)"}`;

const triaged = [];
for (let b = 0; b < items.length; b += BATCH) {
  const batch = items.slice(b, b + BATCH);
  const r = await complete(`triage-${b / BATCH}`, triageSystem, batch.map(render).join("\n\n"), triageSchema);
  if (r) triaged.push(...r.items);
}
const inScope = items.filter((it) => triaged.find((t) => t.idx === it.idx)?.in_scope);
console.log(dryRun ? `dry run: wrote ${Math.ceil(items.length / BATCH)} triage prompts` : `${inScope.length}/${items.length} items judged in scope`);

// --- 3. Cluster and match ------------------------------------------------------

const clusterSchema = obj({
  clusters: {
    type: "array",
    items: obj({
      headline: str,
      actor: { type: "string", enum: ["model", "human-misuse"] },
      item_idxs: { type: "array", items: { type: "integer" } },
      matched_existing_id: { type: ["string", "null"] },
      suggested_action: { type: "string", enum: ["new", "update", "skip"] },
      priority: { type: "string", enum: ["high", "medium", "low"] },
      summary: str,
      models_mentioned: { type: "array", items: str },
      organizations_mentioned: { type: "array", items: str },
      likely_primary_sources: { type: "array", items: str },
      open_questions: str,
    }),
  },
});

const clusterSystem = `You are the aggregation stage of the Alignment Incident Database scout.
${SCOPE}
Given in-scope items (from news, social media, research feeds) and the list of EXISTING database records:
1. Group items that describe the same underlying incident into one cluster. One item belongs to at most one cluster.
2. For each cluster, check whether it matches an existing record (same event: models, organizations, dates,
   or overlapping source URLs). If so, set matched_existing_id and suggest "update" only if the items appear to
   add new facts, sources, or a status change (e.g. company confirmation, charges filed); otherwise "skip".
   If no match, suggest "new". Use "skip" for clusters that on reflection are out of scope.
3. priority: high = deployed incident with real harm, or criminal misuse with charges; medium = new research,
   eval, or system-card finding; low = minor or thinly sourced.
4. summary: 2-4 neutral sentences stating only what the items say, attributing claims ("X said...").
5. likely_primary_sources: URLs among the items, or named documents, that look like primary sources
   (lab posts, papers, system cards, first-hand posts by the affected person).
Never invent facts or URLs. Output only what the items support.`;

let clusters = [];
if (inScope.length || dryRun) {
  const user =
    `## Existing records\n${JSON.stringify(existing)}\n\n## In-scope items\n` +
    (dryRun ? "(dry run: triage results unavailable; showing all items)\n\n" + items.map(render).join("\n\n") : inScope.map(render).join("\n\n"));
  const r = await complete("cluster", clusterSystem, user, clusterSchema);
  clusters = r?.clusters ?? [];
}

// --- Output ----------------------------------------------------------------------

if (dryRun) {
  console.log("dry run: prompts written to scout/out/prompt-*.txt");
  process.exit(0);
}

const byIdx = new Map(items.map((it) => [it.idx, it]));
const digest = {
  model: MODEL,
  generated: new Date().toISOString(),
  usage,
  failures,
  note: "Leads produced by a triage model. Not sources: verify everything against the original URLs.",
  clusters: clusters.map((c) => ({
    ...c,
    items: c.item_idxs.map((i) => byIdx.get(i)).filter(Boolean).map(({ title, url, origin, published }) => ({ title, url, origin, published })),
  })),
  rejected: triaged.filter((t) => !t.in_scope).map((t) => ({ title: byIdx.get(t.idx)?.title, url: byIdx.get(t.idx)?.url, reason: t.reason })),
};
writeFileSync(out("digest.json"), JSON.stringify(digest, null, 2));

const md = [`# Scout digest (${MODEL})`, "", `${clusters.length} clusters from ${inScope.length}/${items.length} in-scope candidates. Tokens: ${usage.prompt} in / ${usage.completion} out.`, ""];
for (const c of digest.clusters) {
  md.push(`## [${c.priority}] ${c.headline}`, `action: **${c.suggested_action}**${c.matched_existing_id ? ` (${c.matched_existing_id})` : ""} · actor: ${c.actor}`, "", c.summary, "");
  for (const it of c.items) md.push(`- [${it.title}](${it.url}) (${it.origin})`);
  if (c.open_questions) md.push("", `Open questions: ${c.open_questions}`);
  md.push("");
}
writeFileSync(out("digest.md"), md.join("\n"));
console.log(`digest: ${clusters.length} clusters → scout/out/digest.json (${usage.prompt} prompt / ${usage.completion} completion tokens)`);
