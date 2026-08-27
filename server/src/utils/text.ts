/** Shared text-normalisation helpers used by parsing, matching and validation. */

const STOP_WORDS = new Set([
  'a','an','and','are','as','at','be','by','for','from','has','have','in','is','it','its',
  'of','on','or','that','the','to','with','will','you','your','we','our','their','this',
  'they','them','using','use','used','able','ability','including','include','includes',
  'strong','good','great','excellent','experience','experienced','work','working','years',
  'year','plus','etc','role','team','teams','across','within','into','other','more','most',
  'new','well','also','who','what','when','where','how','can','may','must','should','would',
]);

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^a-z0-9+#./\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Canonical key for comparing skill names: "Node.js" and "nodejs" collapse. */
export function skillKey(s: string): string {
  return normalize(s).replace(/[\s.\-/]/g, '');
}

export function tokenize(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

export function tokenSet(s: string): Set<string> {
  return new Set(tokenize(s));
}

/** Contiguous n-grams, used to catch multi-word terms like "machine learning". */
export function ngrams(s: string, n: number): string[] {
  const t = normalize(s).split(' ').filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i + n <= t.length; i++) out.push(t.slice(i, i + n).join(' '));
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Cosine similarity over term-frequency vectors. Cheap semantic-ish signal. */
export function cosine(a: string, b: string): number {
  const va = new Map<string, number>();
  const vb = new Map<string, number>();
  for (const t of tokenize(a)) va.set(t, (va.get(t) ?? 0) + 1);
  for (const t of tokenize(b)) vb.set(t, (vb.get(t) ?? 0) + 1);
  if (va.size === 0 || vb.size === 0) return 0;
  let dot = 0;
  for (const [t, w] of va) dot += w * (vb.get(t) ?? 0);
  const mag = (v: Map<string, number>) =>
    Math.sqrt([...v.values()].reduce((s, w) => s + w * w, 0));
  const d = mag(va) * mag(vb);
  return d === 0 ? 0 : dot / d;
}

export function collapseWhitespace(s: string): string {
  return s.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

export function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}
