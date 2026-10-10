// Summarizes what a scout run spent, from files the run already wrote. Makes no model calls.
//
//   node scout/cost-report.mjs [--claude <log>] [--fallback <log>]
//
// Sources:
//   scout/out/digest.json               aggregation (Gemini via OpenRouter): usage.cost_usd
//   scout/out/jobs/*.report.json        incident writer (Gemini via OpenRouter): cost_usd
//   --claude <log>                      the agent run on the Claude subscription (stream-json
//                                       log or claude-code-action execution file): total_cost_usd
//   --fallback <log>                    the agent run via OpenRouter, if the subscription hit its limit
// Prints a Markdown table (for the GitHub job summary) and writes scout/out/cost.json.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const out = (...p) => join(root, "scout/out", ...p);
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const money = (n) => (n == null ? "—" : `$${n.toFixed(n < 1 ? 3 : 2)}`);

// Claude Code logs end with a "result" message carrying the session's total cost and usage.
function claudeRun(path) {
  if (!path || !existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  let msgs;
  try { msgs = [].concat(JSON.parse(raw)); }
  catch { msgs = raw.split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); }
  const results = msgs.filter((m) => m?.type === "result" && m.total_cost_usd != null);
  if (!results.length) return null;
  const last = results[results.length - 1];
  const u = last.usage ?? {};
  return {
    cost_usd: last.total_cost_usd,
    input_tokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    output_tokens: u.output_tokens ?? 0,
    turns: last.num_turns ?? null,
  };
}

const rows = [];
if (existsSync(out("digest.json"))) {
  const d = JSON.parse(readFileSync(out("digest.json"), "utf8"));
  rows.push({ step: "Aggregation (triage + clustering)", model: d.model, payer: "OpenRouter", cost: d.usage?.cost_usd ?? null,
    detail: `${(d.usage?.prompt ?? 0).toLocaleString("en-US")} in / ${(d.usage?.completion ?? 0).toLocaleString("en-US")} out tokens` });
}
const jobsDir = out("jobs");
const reports = existsSync(jobsDir) ? readdirSync(jobsDir).filter((f) => f.endsWith(".report.json")).map((f) => JSON.parse(readFileSync(join(jobsDir, f), "utf8"))) : [];
if (reports.length) {
  const cost = reports.reduce((s, r) => s + (r.cost_usd ?? 0), 0);
  rows.push({ step: "Incident writer", model: reports[0].model, payer: "OpenRouter", cost,
    detail: `${reports.length} record${reports.length === 1 ? "" : "s"}, avg ${money(cost / reports.length)} each` });
}
const sub = claudeRun(arg("--claude"));
if (sub) rows.push({ step: "Claude agent (editor + subagents)", model: "Claude (subscription)", payer: "Subscription", cost: sub.cost_usd,
  detail: `${sub.input_tokens.toLocaleString("en-US")} in / ${sub.output_tokens.toLocaleString("en-US")} out tokens${sub.turns ? `, ${sub.turns} turns` : ""}; API-equivalent value, not billed` });
const fb = claudeRun(arg("--fallback"));
if (fb) rows.push({ step: "Claude agent fallback (usage limit hit)", model: "Claude via OpenRouter", payer: "OpenRouter", cost: fb.cost_usd,
  detail: `${fb.input_tokens.toLocaleString("en-US")} in / ${fb.output_tokens.toLocaleString("en-US")} out tokens` });

const billed = rows.filter((r) => r.payer === "OpenRouter").reduce((s, r) => s + (r.cost ?? 0), 0);
const lines = [
  "## Spend this run",
  "",
  `**Billed (OpenRouter): ${money(billed)}**${sub ? ` · subscription usage worth ${money(sub.cost_usd)} at API prices (not billed)` : ""}`,
  "",
  "| Step | Model | Paid by | Cost | Detail |",
  "|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.step} | ${r.model} | ${r.payer} | ${money(r.cost)} | ${r.detail} |`),
];
if (!rows.length) lines.push("| (no cost data found) | | | | |");
console.log(lines.join("\n"));
writeFileSync(out("cost.json"), JSON.stringify({ billed_usd: billed, subscription_api_equivalent_usd: sub?.cost_usd ?? null, rows }, null, 2));
