// Run after a successful scout run: records everything the run looked at in
// scout/state/seen.json, so the next run skips it. Sources of URLs:
//   scout/out/candidates.json   everything collected (verdict "seen")
//   scout/out/digest.json       Gemini triage ("rejected" / "in-scope")
//   scout/out/examined.json     URLs the agent examined itself, with its decision
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadSeen, saveSeen, mark, seenPath } from "./lib/seen.mjs";

const out = (f) => join(new URL("..", import.meta.url).pathname, "scout/out", f);
const read = (f) => (existsSync(out(f)) ? JSON.parse(readFileSync(out(f), "utf8")) : null);

const seen = loadSeen();
const before = seen.size;

for (const c of read("candidates.json")?.candidates ?? []) mark(seen, c.url, "seen");
const digest = read("digest.json");
for (const r of digest?.rejected ?? []) if (r.url) mark(seen, r.url, "rejected");
for (const c of digest?.clusters ?? []) for (const it of c.items) mark(seen, it.url, `cluster:${c.suggested_action}`);
for (const e of read("examined.json") ?? []) if (e.url) mark(seen, e.url, e.decision ?? "examined");

const kept = saveSeen(seen);
console.log(`seen list: ${before} → ${kept} urls (${seenPath})`);
