// The scout's memory: every URL it has already triaged, so each run only
// spends model time on new material. Stored as { "<normalized url>": [firstSeen, verdict] }.
// Committed to the repo at scout/state/seen.json; the scout workflow updates it after each run.
// SCOUT_SEEN_PATH overrides the location (the local runner points it at the main checkout).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const seenPath = process.env.SCOUT_SEEN_PATH || join(new URL("../..", import.meta.url).pathname, "scout/state/seen.json");
const RETAIN_DAYS = 180;

const DROP_PARAMS = /^(utm_.*|fbclid|gclid|mc_cid|mc_eid|ref|ref_src|source|s|si|cmpid|ito|smid)$/i;

export function normalizeUrl(raw) {
  try {
    const u = new URL(raw);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
    if (u.hostname === "twitter.com") u.hostname = "x.com";
    for (const k of [...u.searchParams.keys()]) if (DROP_PARAMS.test(k)) u.searchParams.delete(k);
    u.protocol = "https:";
    return u.toString().replace(/\/(\?|$)/, "$1");
  } catch {
    return String(raw).trim();
  }
}

export function loadSeen() {
  if (!existsSync(seenPath)) return new Map();
  return new Map(Object.entries(JSON.parse(readFileSync(seenPath, "utf8"))));
}

export function saveSeen(seen) {
  const cutoff = new Date(Date.now() - RETAIN_DAYS * 86400_000).toISOString().slice(0, 10);
  const kept = [...seen].filter(([, [first]]) => first >= cutoff).sort(([a], [b]) => a.localeCompare(b));
  mkdirSync(dirname(seenPath), { recursive: true });
  writeFileSync(seenPath, JSON.stringify(Object.fromEntries(kept), null, 0).replace(/\],"/g, '],\n"'));
  return kept.length;
}

/** Record a URL; the first sighting's date is kept, and the verdict is updated if a better one arrives. */
export function mark(seen, url, verdict, today = new Date().toISOString().slice(0, 10)) {
  const key = normalizeUrl(url);
  const prev = seen.get(key);
  seen.set(key, [prev?.[0] ?? today, verdict ?? prev?.[1] ?? "seen"]);
}
