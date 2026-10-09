// Pulls recent items from the feeds/APIs in scout/sources.yaml into
// scout/out/candidates.json for the scout agent to triage. Deterministic and
// cheap: no LLM calls here. Items whose URL is already cited by an incident
// are dropped.
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { XMLParser } from "fast-xml-parser";
import { loadSeen, normalizeUrl } from "./lib/seen.mjs";

const root = new URL("..", import.meta.url).pathname;
const cfg = parse(readFileSync(join(root, "scout/sources.yaml"), "utf8"));
const since = new Date(Date.now() - (cfg.window_hours ?? 48) * 3600_000);
const keywords = cfg.keywords.map((k) => k.toLowerCase());
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

// Skip anything already cited by an incident or already triaged on a previous run.
const seenBefore = loadSeen();
const known = new Set(
  readdirSync(join(root, "data/incidents"))
    .filter((f) => f.endsWith(".yaml"))
    .flatMap((f) => parse(readFileSync(join(root, "data/incidents", f), "utf8")).sources.map((s) => normalizeUrl(s.url))),
);
let skippedSeen = 0;

const strip = (s = "") => String(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);
const text = (v) => (typeof v === "object" && v !== null ? v["#text"] ?? "" : v ?? "");
const matches = (item) => keywords.some((k) => `${item.title} ${item.snippet}`.toLowerCase().includes(k));
const arr = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

async function get(url, headers = {}) {
  const res = await fetch(url, { headers: { "User-Agent": "AlignmentIncidentDatabase-scout/0.1", ...headers }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

async function readFeed(origin, url) {
  const doc = xml.parse(await (await get(url)).text());
  if (doc.rss) {
    return arr(doc.rss.channel.item).map((i) => ({
      origin, title: strip(text(i.title)), url: text(i.link), published: i.pubDate, snippet: strip(text(i.description)),
    }));
  }
  if (doc.feed) {
    return arr(doc.feed.entry).map((e) => ({
      origin, title: strip(text(e.title)),
      url: arr(e.link).find((l) => !l.rel || l.rel === "alternate")?.href ?? arr(e.link)[0]?.href,
      published: e.published ?? e.updated, snippet: strip(text(e.summary)),
    }));
  }
  throw new Error("not RSS or Atom");
}

const jobs = [];
for (const f of cfg.feeds ?? []) {
  jobs.push([f.name, async () => {
    const items = await readFeed(f.name, f.url);
    return f.filter ? items.filter(matches) : items;
  }]);
}
for (const q of cfg.google_news ?? []) {
  jobs.push([`Google News: ${q}`, () =>
    readFeed(`Google News: ${q}`, `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:2d`)}&hl=en-US&gl=US&ceid=US:en`)]);
}
for (const q of cfg.hacker_news ?? []) {
  jobs.push([`HN: ${q}`, async () => {
    const ts = Math.floor(since.getTime() / 1000);
    const url = `https://hn.algolia.com/api/v1/search_by_date?tags=story&query=${encodeURIComponent(q)}&numericFilters=created_at_i>${ts}`;
    const { hits } = await (await get(url)).json();
    return hits.map((h) => ({
      origin: `HN: ${q}`, title: h.title, url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
      published: h.created_at, snippet: `HN discussion: https://news.ycombinator.com/item?id=${h.objectID} (${h.points} points)`,
    }));
  }]);
}
for (const q of cfg.arxiv ?? []) {
  jobs.push([`arXiv: ${q}`, () =>
    readFeed(`arXiv: ${q}`, `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(q)}&sortBy=submittedDate&sortOrder=descending&max_results=25`)]);
}
if (process.env.X_BEARER_TOKEN) {
  for (const q of cfg.x ?? []) {
    jobs.push([`X: ${q}`, async () => {
      const params = new URLSearchParams({
        query: q, max_results: "50", start_time: since.toISOString(),
        "tweet.fields": "created_at,public_metrics", expansions: "author_id", "user.fields": "username",
      });
      const body = await (await get(`https://api.x.com/2/tweets/search/recent?${params}`, { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` })).json();
      const users = new Map((body.includes?.users ?? []).map((u) => [u.id, u.username]));
      return (body.data ?? []).map((t) => {
        const user = users.get(t.author_id) ?? "i";
        return {
          origin: `X: ${q}`, title: `@${user}`, url: `https://x.com/${user}/status/${t.id}`, published: t.created_at,
          snippet: `${strip(t.text)} [${t.public_metrics?.like_count ?? 0} likes, ${t.public_metrics?.retweet_count ?? 0} reposts]`,
        };
      });
    }]);
  }
} else {
  console.warn("X_BEARER_TOKEN not set; skipping X queries");
}

const results = await Promise.allSettled(jobs.map(([, run]) => run()));
const errors = [];
const seen = new Set();
const candidates = [];
results.forEach((r, i) => {
  if (r.status === "rejected") return errors.push(`${jobs[i][0]}: ${r.reason.message}`);
  for (const item of r.value) {
    const date = new Date(item.published);
    const key = item.url && normalizeUrl(item.url);
    if (!key || known.has(key) || seen.has(key)) continue;
    if (!isNaN(date) && date < since) continue;
    seen.add(key);
    if (seenBefore.has(key)) { skippedSeen++; continue; }
    candidates.push({ ...item, published: isNaN(date) ? null : date.toISOString() });
  }
});
candidates.sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""));

mkdirSync(join(root, "scout/out"), { recursive: true });
writeFileSync(join(root, "scout/out/candidates.json"), JSON.stringify({ since: since.toISOString(), errors, candidates }, null, 2));
console.log(`${candidates.length} new candidates from ${jobs.length - errors.length}/${jobs.length} sources (${skippedSeen} skipped as already seen)`);
for (const e of errors) console.warn(`error ${e}`);
