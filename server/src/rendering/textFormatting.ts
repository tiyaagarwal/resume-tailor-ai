/**
 * Shared bold-run handling for bullet/body text, used identically by both
 * the LaTeX and DOCX renderers so the two outputs never disagree on which
 * phrases get bolded.
 *
 * The AI tailoring step (ai/tailor.ts) may wrap existing key phrases/metrics
 * in `**double-asterisk**` markdown-style markers. The deterministic
 * heuristic path (no API key) has no such markers, so `autoBoldMetrics`
 * applies an equivalent deterministic rule directly to plain text.
 */

/** Wraps numbers/percentages/counts already present in the text in `**`
 *  markers, e.g. "reduced latency by 32%" -> "reduced latency by **32%**".
 *  Never adds a marker around anything not already there — this only
 *  changes emphasis, never content. */
export function autoBoldMetrics(text: string): string {
  if (/\*\*/.test(text)) return text; // already has markers (e.g. from the AI path) — don't double-process
  return text.replace(/\b\d[\d,]*\.?\d*[%+]?\s?(?:x|X)?\b/g, (m) => (m.trim() ? `**${m}**` : m));
}

/** Removes `**` markers — used before truthfulness diffing and anywhere
 *  plain, unmarked text is needed. */
export function stripBoldMarkers(text: string): string {
  return text.replace(/\*\*/g, '');
}

export interface BoldRun {
  text: string;
  bold: boolean;
}

/** Splits `**bold**`-marked text into plain/bold runs for renderers to map
 *  onto `\textbf{}` (LaTeX) or `TextRun({ bold: true })` (DOCX). Malformed
 *  (unbalanced) input degrades gracefully to one unbolded run rather than
 *  throwing. */
export function splitBoldRuns(text: string): BoldRun[] {
  const parts = text.split('**');
  if (parts.length % 2 === 0) {
    // Unbalanced markers — safest fallback is to render the plain text.
    return [{ text: stripBoldMarkers(text), bold: false }];
  }
  return parts.filter((p) => p.length > 0).map((p, i) => ({ text: p, bold: i % 2 === 1 }));
}
