// Turns [@source-id] citations into numbered superscript links. Sources are
// numbered in order of first citation (writeup, then claims), and uncited
// sources go last. The validator guarantees there won't be any uncited sources.
import { marked } from "marked";
import type { Incident, Source } from "./data";

export function numberSources(i: Incident) {
  const order: string[] = [];
  const see = (id: string) => { if (!order.includes(id)) order.push(id); };
  for (const m of i.writeup.matchAll(/\[(@[a-z0-9-]+(?:;\s*@[a-z0-9-]+)*)\]/g)) for (const id of m[1].split(/;\s*/)) see(id.slice(1));
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
  const md = i.writeup.replace(/\s*\[(@[a-z0-9-]+(?:;\s*@[a-z0-9-]+)*)\]/g, (_, ids: string) =>
    ids.split(/;\s*/).map((id) => citeLink(num.get(id.slice(1))!, titles.get(id.slice(1)))).join(""));
  return marked.parse(md, { async: false }) as string;
}

// ---------- Sentence → claim linking (for hover evidence) ----------
// The data doesn't link writeup sentences to claims, so match them at build time:
// a sentence's candidates are the claims citing one of the sentence's sources,
// ranked by how many of the claim's distinctive words (and numbers) the sentence shares.
const STOP = new Set("the a an and or of to in on for with by at from as is was were be been that this these those it its their his her they he she which who whom into than then also after before over under about more most such not no but if so said says say according".split(" "));
const words = (s: string) => new Set((s.toLowerCase().match(/[a-z0-9][a-z0-9.%-]*[a-z0-9%]|[0-9]/g) ?? []).filter((w) => w.length > 2 && !STOP.has(w) || /\d/.test(w)));

function matchClaims(sentence: string, cites: string[], i: Incident) {
  const sw = words(sentence);
  return i.claims
    .map((c, idx) => {
      if (cites.length && !c.sources.some((s) => cites.includes(s))) return { idx, score: 0 };
      const cw = words(c.text);
      let hit = 0;
      for (const w of cw) if (sw.has(w)) hit += /\d/.test(w) ? 2 : 1; // shared numbers count double
      return { idx, score: cw.size ? hit / cw.size : 0 };
    })
    .filter((m) => m.score >= 0.28)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((m) => m.idx);
}

const CITE = /\s*\[(@[a-z0-9-]+(?:;\s*@[a-z0-9-]+)*)\]/g;
// A sentence ends at . ! or ? (plus closing quotes/brackets and any trailing citations),
// followed by whitespace and a capital, quote or digit, or the end of the paragraph.
const SENTENCE = /[^]*?[.!?]["”’)]*(?:\s*\[@[^\]]+\])*(?=\s+["“(A-Z0-9]|\s*$)|[^]+$/g;

/** Writeup HTML where each sentence is a span listing its matching claims, plus which claims matched nothing. */
export function renderLinkedWriteup(i: Incident, num: Map<string, number>) {
  const titles = new Map(i.sources.map((s) => [s.id, `${s.publisher}: ${s.title}`]));
  const used = new Set<number>();
  const paras = i.writeup.trim().split(/\n\s*\n/).map((para) => {
    const flat = para.replace(/\s*\n\s*/g, " ").trim();
    const sentences = (flat.match(SENTENCE) ?? [flat]).map((s) => s.trim()).filter(Boolean);
    return sentences.map((s) => {
      const cites = [...s.matchAll(CITE)].flatMap((m) => m[1].split(/;\s*/).map((c) => c.slice(1)));
      const plain = s.replace(CITE, "");
      const claimIdx = matchClaims(plain, cites, i);
      claimIdx.forEach((c) => used.add(c));
      const body = s.replace(CITE, (_, ids: string) => ids.split(/;\s*/).map((id) => citeLink(num.get(id.slice(1))!, titles.get(id.slice(1)))).join(""));
      const inner = (marked.parseInline(body, { async: false }) as string);
      return claimIdx.length
        ? `<span class="sent" tabindex="0" data-claims="${claimIdx.join(",")}">${inner}</span>`
        : `<span class="sent-plain">${inner}</span>`;
    }).join(" ");
  });
  return { html: paras.map((p) => `<p>${p}</p>`).join("\n"), unmatched: i.claims.map((_, k) => k).filter((k) => !used.has(k)) };
}
