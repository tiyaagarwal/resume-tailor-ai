/**
 * Detects an EXISTING, evidence-based claim of DSA/algorithm practice
 * somewhere in the resume's own text (e.g. "300+ problems solved: arrays,
 * trees, graphs"). This is the only source ever used to populate the
 * Skills -> Core CS bullet and the Extra Curricular DSA-practice line — if
 * this returns null, both are omitted rather than fabricated with a made-up
 * count.
 */

export interface DsaSignal {
  count: number;
  topics?: string;
}

const DSA_RE =
  /(\d{2,4})\+?\s*(?:dsa\s*)?(?:data\s*structures?(?:\s*(?:&|and)\s*algorithms?)?\s*)?(?:problems?|questions?)\s*(?:solved|completed|practiced)?/i;

export function detectDsaPracticeSignal(rawText: string): DsaSignal | null {
  const m = DSA_RE.exec(rawText);
  if (!m) return null;

  const count = parseInt(m[1], 10);
  // Guards against matching an unrelated 2-4 digit number that happens to sit
  // near the word "problems" (e.g. a year).
  if (!Number.isFinite(count) || count < 10 || count > 100000) return null;

  const tailStart = (m.index ?? 0) + m[0].length;
  const tail = rawText.slice(tailStart, tailStart + 140);
  const topicsMatch = /^[\s:.-]*([a-zA-Z][a-zA-Z ,&/]{3,100})/.exec(tail);
  const topics = topicsMatch ? topicsMatch[1].split(/[.\n]/)[0].trim() : undefined;

  return { count, topics: topics && topics.length < 100 ? topics : undefined };
}
