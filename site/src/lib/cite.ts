// Turns [@source-id] citations into numbered superscript links. Sources are
// numbered in order of first citation (writeup, then claims), and uncited
// sources go last. The validator guarantees there won't be any uncited sources.
import { marked } from "marked";
import type { Incident, Source } from "./data";

export function numberSources(i: Incident) {
  const order: string[] = [];
  const see = (id: string) => { if (!order.includes(id)) order.push(id); };
  for (const m of i.writeup.matchAll(/\[@([a-z0-9-]+)\]/g)) see(m[1]);
  for (const c of i.claims) c.sources.forEach(see);
  for (const s of i.sources) see(s.id);
  const byId = new Map(i.sources.map((s) => [s.id, s]));
  const numbered = order.map((id, n) => ({ n: n + 1, ...(byId.get(id) as Source) }));
  const num = new Map(numbered.map((s) => [s.id, s.n]));
  return { numbered, num };
}

export const citeLink = (n: number, title = "") =>
  `<sup class="cite"><a href="#src-${n}" title="${title.replace(/"/g, "&quot;")}">${n}</a></sup>`;

export function renderWriteup(i: Incident, num: Map<string, number>) {
  const titles = new Map(i.sources.map((s) => [s.id, `${s.publisher}: ${s.title}`]));
  const md = i.writeup.replace(/\s*\[@([a-z0-9-]+)\]/g, (_, id) => citeLink(num.get(id)!, titles.get(id)));
  return marked.parse(md, { async: false }) as string;
}
