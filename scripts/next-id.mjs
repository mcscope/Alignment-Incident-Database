// Prints the next free incident id (AID-<year>-<seq>), CVE-style.
// Pass a count to reserve several: `npm run next-id -- 3`.
import { readdirSync } from "node:fs";

const year = new Date().getUTCFullYear();
const pattern = new RegExp(`AID-${year}-(\\d{4,})\\.yaml`);
const names = readdirSync(new URL("../data/incidents", import.meta.url));
const max = Math.max(0, ...names.map((n) => Number(n.match(pattern)?.[1] ?? 0)));
const count = Number(process.argv[2] ?? 1);
for (let i = 1; i <= count; i++) console.log(`AID-${year}-${String(max + i).padStart(4, "0")}`);
