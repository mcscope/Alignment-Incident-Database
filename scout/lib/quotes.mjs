// Verbatim-quote checking: does a claim's quote appear in its source's text?
// Normalizes case, whitespace, curly quotes and dashes so formatting
// differences don't count as mismatches; anything else does.
export const normalize = (s) =>
  String(s).toLowerCase()
    .replace(/[‘’‛′]/g, "'").replace(/[“”„″]/g, '"').replace(/[‐-―−]/g, "-")
    .replace(/…/g, "...").replace(/ /g, " ").replace(/\s+/g, " ").trim();

/** For each claim: { quote, sources, found: true|false|null } (null = no text for any cited source). */
export function checkQuotes(doc, textBySourceId) {
  return doc.claims.map((c) => {
    if (!c.quote) return { text: c.text, quote: null, sources: c.sources, found: false };
    const texts = c.sources.map((s) => textBySourceId[s]).filter(Boolean);
    if (!texts.length) return { text: c.text, quote: c.quote, sources: c.sources, found: null };
    const q = normalize(c.quote);
    return { text: c.text, quote: c.quote, sources: c.sources, found: texts.some((t) => normalize(t).includes(q)) };
  });
}
