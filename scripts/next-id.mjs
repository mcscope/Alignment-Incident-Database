// Prints the next free incident id (AID-<year>-<seq>), CVE-style.
// Considers ids on disk and, when the gh CLI is available, ids in open PRs,
// so parallel proposals don't collide. Pass a count to reserve several: `npm run next-id -- 3`.
import { readdirSync } from "node:fs";
import { execSync } from "node:child_process";

const year = new Date().getUTCFullYear();
const pattern = new RegExp(`AID-${year}-(\\d{4,})\\.yaml`);
const names = readdirSync(new URL("../data/incidents", import.meta.url));
try {
  const prs = JSON.parse(execSync("gh pr list --state open --json files --limit 200", { stdio: ["ignore", "pipe", "ignore"] }));
  for (const pr of prs) for (const f of pr.files) names.push(f.path);
} catch {
  console.error("note: gh unavailable, ids in open PRs not checked");
}
const max = Math.max(0, ...names.map((n) => Number(n.match(pattern)?.[1] ?? 0)));
const count = Number(process.argv[2] ?? 1);
for (let i = 1; i <= count; i++) console.log(`AID-${year}-${String(max + i).padStart(4, "0")}`);
