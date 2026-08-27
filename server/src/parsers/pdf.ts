import type { ProfileLink } from '../types/resume.ts';
import { badRequest } from '../utils/errors.ts';
import { collapseWhitespace } from '../utils/text.ts';
import type { ExtractedDocument } from './docx.ts';

/**
 * PDF extraction that preserves hyperlinks.
 *
 * Text is reconstructed with layout awareness: pdfjs returns positioned items,
 * so we group them into visual lines by their y-coordinate. Without this, a
 * two-column contact header collapses into unreadable soup and downstream
 * section detection fails.
 *
 * Link URLs come from /Annots Link annotations, and we map each annotation
 * rectangle back to the text sitting inside it to recover the visible label.
 */

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPdf = any;

async function loadPdfjs(): Promise<AnyPdf> {
  // The legacy build runs on Node's fake worker with no DOM. Do NOT assign
  // GlobalWorkerOptions.workerSrc here: an empty string makes pdfjs attempt a
  // real worker load and every getDocument() call fails.
  const mod = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return (mod as AnyPdf).default ?? mod;
}

function groupIntoLines(items: TextItem[]): string[] {
  if (items.length === 0) return [];
  // Sort top-to-bottom, then left-to-right.
  const sorted = [...items].sort((a, b) => (Math.abs(a.y - b.y) > 2 ? b.y - a.y : a.x - b.x));
  const lines: string[] = [];
  let current: TextItem[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    const prev = current[current.length - 1];
    // Same visual line if the baselines are within a small tolerance.
    if (Math.abs(item.y - prev.y) <= Math.max(2, prev.height * 0.5)) {
      current.push(item);
    } else {
      lines.push(joinLine(current));
      current = [item];
    }
  }
  lines.push(joinLine(current));
  return lines.map((l) => l.trim()).filter(Boolean);
}

function joinLine(items: TextItem[]): string {
  const ordered = [...items].sort((a, b) => a.x - b.x);
  let out = '';
  let cursorEnd = 0;
  for (const [i, it] of ordered.entries()) {
    if (i > 0) {
      const gap = it.x - cursorEnd;
      // A wide gap is a column/field separator; a small one is a word space.
      if (gap > it.height * 1.4) out += '  |  ';
      else if (gap > 0.4 || !out.endsWith(' ')) out += ' ';
    }
    out += it.str;
    cursorEnd = it.x + it.width;
  }
  return out.replace(/\s+/g, ' ').replace(/\s+\|\s+/g, ' | ');
}

export async function extractPdf(buf: Buffer): Promise<ExtractedDocument> {
  const pdfjs = await loadPdfjs();
  let doc: AnyPdf;
  try {
    doc = await pdfjs.getDocument({
      data: new Uint8Array(buf),
      useSystemFonts: true,
      isEvalSupported: false,
    }).promise;
  } catch (err) {
    throw badRequest(
      'This PDF could not be opened. It may be corrupted or password-protected — try re-exporting it and uploading again.',
      { cause: (err as Error).message },
    );
  }

  const allLines: string[] = [];
  const links: ProfileLink[] = [];
  const seen = new Set<string>();

  const pushLink = (label: string, url: string) => {
    const clean = url.trim();
    if (!clean) return;
    const key = `${label.trim().toLowerCase()}|${clean}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ label: label.trim() || clean, url: clean });
  };

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    const items: TextItem[] = content.items
      .filter((i: AnyPdf) => typeof i.str === 'string' && i.str.trim().length > 0)
      .map((i: AnyPdf) => ({
        str: i.str,
        x: i.transform[4],
        y: i.transform[5],
        width: i.width ?? 0,
        height: Math.abs(i.transform[3]) || 10,
      }));

    allLines.push(...groupIntoLines(items));

    // Recover the visible label for each link by intersecting rectangles.
    const annots = await page.getAnnotations({ intent: 'display' });
    for (const a of annots) {
      if (a.subtype !== 'Link' || !a.url) continue;
      const [x1, y1, x2, y2] = a.rect;
      const inside = items
        .filter((it) => it.x + it.width > x1 - 1 && it.x < x2 + 1 && it.y > y1 - 3 && it.y < y2 + 3)
        .sort((m, n) => m.x - n.x)
        .map((it) => it.str)
        .join('')
        .trim();
      pushLink(inside || a.url, a.url);
    }
  }

  const text = collapseWhitespace(allLines.join('\n'));
  if (!text) {
    throw badRequest(
      'No selectable text was found in this PDF. It looks like a scan or an image export — please upload a text-based PDF or a DOCX.',
    );
  }

  // Bare, non-annotated URLs and emails still need to become working links.
  for (const m of text.matchAll(/https?:\/\/[^\s<>()\[\],;"'|]+/g)) pushLink(m[0], m[0]);
  for (const m of text.matchAll(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g)) pushLink(m[0], `mailto:${m[0]}`);

  return { text, links };
}
