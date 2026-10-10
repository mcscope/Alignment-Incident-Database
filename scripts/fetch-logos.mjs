// Downloads an icon for each organization in data/taxonomy/organizations.yaml into
// site/public/logos/, once, so the site never loads third-party images at runtime.
// Writes site/public/logos/index.json ({ org-id: filename }). Orgs with no usable
// icon are left out and get an initials badge on the site.
//
//   npm run logos            fetch icons for orgs that don't have one yet
//   npm run logos -- --force refetch all
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const root = new URL("..", import.meta.url).pathname;
const dir = join(root, "site/public/logos");
const manifestPath = join(dir, "index.json");
const force = process.argv.includes("--force");
const orgs = parse(readFileSync(join(root, "data/taxonomy/organizations.yaml"), "utf8"));
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};

const get = async (url) => {
  const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (AlignmentIncidentDatabase)" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return null;
  const type = res.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) return null;
  return { buf: Buffer.from(await res.arrayBuffer()), type };
};
const hash = (b) => createHash("sha1").update(b).digest("hex");
const services = [
  (d) => `https://www.google.com/s2/favicons?domain=${d}&sz=128`,
  (d) => `https://icons.duckduckgo.com/ip3/${d}.ico`,
];
// Each service's generic placeholder (what it returns for a domain with no icon).
const placeholders = new Set();
for (const s of services) {
  const p = await get(s("no-such-domain-aid-placeholder-check.invalid"));
  if (p) placeholders.add(hash(p.buf));
}

let fetched = 0, missing = [];
for (const o of orgs) {
  if (!force && manifest[o.id] && existsSync(join(dir, manifest[o.id]))) continue;
  if (!o.url) { missing.push(o.id); continue; }
  const domain = new URL(o.url).hostname.replace(/^www\./, "");
  let saved = null;
  for (const s of services) {
    const r = await get(s(domain)).catch(() => null);
    if (!r || r.buf.length < 100 || placeholders.has(hash(r.buf))) continue;
    const ext = r.type.includes("png") ? "png" : r.type.includes("svg") ? "svg" : r.type.includes("icon") ? "ico" : "png";
    saved = `${o.id}.${ext}`;
    writeFileSync(join(dir, saved), r.buf);
    break;
  }
  if (saved) { manifest[o.id] = saved; fetched++; } else { delete manifest[o.id]; missing.push(o.id); }
}
writeFileSync(manifestPath, JSON.stringify(Object.fromEntries(Object.entries(manifest).sort()), null, 2) + "\n");
console.log(`logos: ${fetched} fetched, ${Object.keys(manifest).length} total; initials fallback for: ${missing.join(", ") || "none"}`);
