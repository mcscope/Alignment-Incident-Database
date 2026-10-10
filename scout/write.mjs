// Drafts one incident record with Gemini (via OpenRouter) from real source text,
// then validates it and checks every quote verbatim against its source.
//
//   node scout/write.mjs scout/out/jobs/<id>.json
//
// Job file (written by the scout's lead agent):
// {
//   "id": "AID-2026-0123", "action": "new" | "update",
//   "brief": "verified findings, angle, caveats for the writer",
//   "sources": [{ "id": "openai-report", "url": "...", "title": "...", "publisher": "...",
//                 "published": "2026-08", "kind": "primary",
//                 "text_file": "optional path to text saved by the agent (used if fetch fails)" }]
// }
// Writes data/incidents/<id>.yaml, scout/out/jobs/<id>.taxonomy.yaml (requested new
// taxonomy terms, if any) and scout/out/jobs/<id>.report.json. Exit code 0 on success.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { parse } from "yaml";
import { checkQuotes } from "./lib/quotes.mjs";

const root = new URL("..", import.meta.url).pathname;
const cfg = parse(readFileSync(join(root, "scout/sources.yaml"), "utf8"));
const MODEL = process.env.SCOUT_WRITER_MODEL || cfg.writer?.model || "google/gemini-3.8-flash";
const jobPath = process.argv[2];
if (!jobPath) { console.error("usage: node scout/write.mjs <job.json>"); process.exit(2); }
if (!process.env.OPENROUTER_API_KEY) { console.error("OPENROUTER_API_KEY not set: use a Claude writer instead"); process.exit(3); }
const job = JSON.parse(readFileSync(jobPath, "utf8"));
const outDir = join(root, "scout/out/jobs");
const cacheDir = join(root, "scout/out/source-cache");
mkdirSync(outDir, { recursive: true }); mkdirSync(cacheDir, { recursive: true });

// ---------- source text ----------
const htmlToText = (h) => h
  .replace(/<(script|style|noscript|svg|nav|footer|header|form)[\s\S]*?<\/\1>/gi, " ")
  .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, "\n")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&rsquo;/g, "’").replace(/&lsquo;/g, "‘")
  .replace(/&ldquo;/g, "“").replace(/&rdquo;/g, "”").replace(/&mdash;/g, "—").replace(/&ndash;/g, "–").replace(/&hellip;/g, "…")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();

async function sourceText(s) {
  const cache = join(cacheDir, createHash("sha1").update(s.url).digest("hex") + ".txt");
  if (existsSync(cache)) return { text: readFileSync(cache, "utf8"), via: "cache" };
  try {
    const res = await fetch(s.url, { headers: { "User-Agent": "Mozilla/5.0 (AlignmentIncidentDatabase-scout)" }, redirect: "follow", signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    let text;
    if (type.includes("pdf") || s.url.toLowerCase().endsWith(".pdf")) {
      const pdf = join(cacheDir, "tmp.pdf");
      writeFileSync(pdf, Buffer.from(await res.arrayBuffer()));
      text = execFileSync("pdftotext", ["-layout", pdf, "-"], { encoding: "utf8", maxBuffer: 64 << 20 });
    } else {
      text = htmlToText(await res.text());
    }
    if (text.length < 400) throw new Error("too little text (blocked or JS-only page?)");
    writeFileSync(cache, text);
    return { text, via: "fetch" };
  } catch (e) {
    if (s.text_file && existsSync(s.text_file)) return { text: readFileSync(s.text_file, "utf8"), via: `text_file (fetch failed: ${e.message})` };
    return { text: null, via: `unavailable: ${e.message}` };
  }
}

const texts = {}, fetchLog = {};
for (const s of job.sources) {
  const r = await sourceText(s);
  fetchLog[s.id] = r.via;
  if (r.text) texts[s.id] = r.text.slice(0, 120_000);
}
const usable = job.sources.filter((s) => texts[s.id]);
if (!usable.length) { console.error("no source text available", fetchLog); process.exit(4); }

// ---------- prompt (same shape as the Sonnet-vs-Gemini bake-off) ----------
const ids = (f) => parse(readFileSync(join(root, `data/taxonomy/${f}.yaml`), "utf8")).map((t) => t.id).join(", ");
const existing = job.action === "update" && existsSync(join(root, `data/incidents/${job.id}.yaml`)) ? readFileSync(join(root, `data/incidents/${job.id}.yaml`), "utf8") : null;
const today = new Date().toISOString().slice(0, 10);
const prompt = `You are drafting ONE incident record for the Alignment Incident Database, a public, CVE-like record of AI alignment incidents.

Follow these editorial rules exactly:
<rules>
${readFileSync(join(root, "CLAUDE.md"), "utf8")}
</rules>

The record must validate against this JSON Schema:
<schema>
${readFileSync(join(root, "schema/incident.schema.json"), "utf8")}
</schema>

Allowed taxonomy ids (use only these; if you truly need a new one, list it under PROPOSED TAXONOMY after the YAML):
- behaviors: ${ids("behaviors")}
- models: ${ids("models")}
- organizations: ${ids("organizations")}
- harm categories: ${ids("harm_categories")}

Style template (an existing record):
<example>
${readFileSync(join(root, "data/incidents/AID-2026-0006.yaml"), "utf8")}
</example>
${existing ? `\nThis is an UPDATE. The current record is below; return the complete updated record, keeping its id, existing sources and claims unless the new sources correct them, and setting record.updated to "${today}".\n<current>\n${existing}\n</current>\n` : ""}
Editor's brief (verified by the editor; use it to choose what matters, but every fact you write must come from the sources below):
<brief>
${job.brief ?? ""}
</brief>

Sources. You have read exactly these and nothing else. Cite only them, using the given ids:
${usable.map((s) => `<source id="${s.id}" url="${s.url}" title="${s.title}" publisher="${s.publisher}" published="${s.published ?? ""}" kind="${s.kind ?? ""}">\n${texts[s.id]}\n</source>`).join("\n\n")}

Requirements:
- id: ${job.id}. ${existing ? "" : `record: created "${today}", updated "${today}", created_by agent, review_status draft.`}
- Every claim has a "quote": a verbatim passage copied exactly from its cited source that contains the specific fact the claim states (names, numbers, dates). Copy it character for character.
- Cite in the writeup with [@source-id]; for several sources use [@a; @b].
- If a source says its content is AI-generated, summarized, or may contain inaccuracies, attribute those facts to it and say so in record.notes.
- reach: use "breakout" only if the behavior crossed a containment boundary; agents that were given real-world access (email, web, accounts) by design are "deployed".
- List every model the sources tie to the behavior, and only those.
- Record numbers the sources report in measurements.
Output ONLY the YAML document (no code fences, no commentary), then optionally a line "PROPOSED TAXONOMY:" followed by YAML: a mapping of behaviors/models/organizations/harm_categories to lists of full entries.`;

// ---------- call the model ----------
const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json", "X-Title": "Alignment Incident Database writer" },
  body: JSON.stringify({ model: MODEL, temperature: 0, max_tokens: 32000, messages: [{ role: "user", content: prompt }] }),
  signal: AbortSignal.timeout(600_000),
});
if (!res.ok) { console.error(`OpenRouter ${res.status}: ${await res.text()}`); process.exit(5); }
const body = await res.json();
const raw = body.choices[0].message.content.replace(/^```(?:yaml)?\s*\n/m, "").replace(/\n```\s*$/m, "");
const [yamlPart, taxPart] = raw.split(/^PROPOSED TAXONOMY:\s*$/m);
let doc;
try { doc = parse(yamlPart); } catch (e) { writeFileSync(join(outDir, `${job.id}.raw.txt`), raw); console.error("model returned invalid YAML:", e.message); process.exit(6); }
writeFileSync(join(root, `data/incidents/${job.id}.yaml`), yamlPart.trim() + "\n");
if (taxPart?.trim()) writeFileSync(join(outDir, `${job.id}.taxonomy.yaml`), taxPart.trim() + "\n");

// ---------- checks ----------
const quotes = checkQuotes(doc, texts);
let validation = "ok";
try { execFileSync("node", [join(root, "scripts/validate.mjs")], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
catch (e) { validation = ((e.stdout ?? "") + (e.stderr ?? "")).split("\n").filter((l) => l.includes(job.id) || /unknown (model|organization|behavior|harm)/.test(l)).join("\n") || "failed (see npm run validate)"; }
const report = {
  id: job.id, model: MODEL, cost_usd: body.usage?.cost ?? null, sources: fetchLog,
  quotes_verified: `${quotes.filter((q) => q.found).length}/${quotes.length}`,
  quotes_failed: quotes.filter((q) => q.found === false).map((q) => ({ claim: q.text, quote: q.quote })),
  quotes_unchecked: quotes.filter((q) => q.found === null).map((q) => q.text),
  taxonomy_requests: taxPart?.trim() ? `scout/out/jobs/${job.id}.taxonomy.yaml` : null,
  validation,
};
writeFileSync(join(outDir, `${job.id}.report.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
