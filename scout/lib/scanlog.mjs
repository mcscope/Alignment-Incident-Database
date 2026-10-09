// The scan log: data/scans/YYYY-MM-DD.yaml lists every source the scout looked
// at that day and what came of it. It serves as the bibliography of the daily
// update and as the scout's memory: any URL already in a scan log, or already
// cited by an incident, is never scanned again.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";

const root = new URL("../..", import.meta.url).pathname;
const scansDir = join(root, "data/scans");
const DROP_PARAMS = /^(utm_.*|fbclid|gclid|mc_cid|mc_eid|ref|ref_src|source|s|si|cmpid|ito|smid)$/i;

export const today = () => new Date().toISOString().slice(0, 10);
export const logPath = (date = today()) => join(scansDir, `${date}.yaml`);

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

/** Every URL already scanned (any scan log) or cited (any incident), normalized. */
export function knownUrls() {
  const urls = new Set();
  for (const f of existsSync(scansDir) ? readdirSync(scansDir).filter((f) => f.endsWith(".yaml")) : []) {
    for (const e of parse(readFileSync(join(scansDir, f), "utf8"))?.scanned ?? []) urls.add(normalizeUrl(e.url));
  }
  const inc = join(root, "data/incidents");
  for (const f of readdirSync(inc).filter((f) => f.endsWith(".yaml"))) {
    for (const s of parse(readFileSync(join(inc, f), "utf8")).sources) urls.add(normalizeUrl(s.url));
  }
  return urls;
}

export function readLog(date = today()) {
  return existsSync(logPath(date)) ? parse(readFileSync(logPath(date), "utf8")) : { date, scanned: [] };
}

export function writeLog(log) {
  const header =
    "# Sources the scout scanned on this date and what came of each.\n" +
    "# verdict: cited (used in `incident`) | lead (in scope, not acted on) | skipped (in scope, no change; see reason)\n" +
    "#          | rejected (out of scope; see reason) | unreviewed (collected, not triaged)\n";
  writeFileSync(logPath(log.date), header + stringify(log, { lineWidth: 0 }));
}
