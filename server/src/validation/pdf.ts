import type { LinkValidationResult } from '../types/tailored.ts';
import { logger } from '../utils/logger.ts';

const log = logger('pdf-validate');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPdfLib = any;

async function loadPdfLib(): Promise<AnyPdfLib> {
  return import('pdf-lib');
}

export async function getPageCount(pdf: Buffer): Promise<number> {
  const { PDFDocument } = await loadPdfLib();
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  return doc.getPageCount();
}

/**
 * Extracts real hyperlink annotations from the PDF.
 *
 * This reads /Annots -> /A -> /URI from the document object graph, i.e. what a
 * PDF reader would actually make clickable. Scanning the text layer for
 * URL-shaped strings would happily "pass" a resume whose links are dead text,
 * which is precisely the failure mode this project exists to prevent.
 */
export async function extractPdfLinks(pdf: Buffer): Promise<string[]> {
  const { PDFDocument, PDFName } = await loadPdfLib();
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const urls: string[] = [];

  for (const page of doc.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let i = 0; i < annots.size(); i++) {
      try {
        const annot = annots.lookup(i);
        if (!annot?.get) continue;
        const action = annot.get(PDFName.of('A'));
        if (!action) continue;
        const resolved = action.lookup ? action : doc.context.lookup(action);
        const uri = resolved?.get?.(PDFName.of('URI')) ?? resolved?.lookup?.(PDFName.of('URI'));
        const value = doc.context.lookup(uri) ?? uri;
        if (!value) continue;
        const str =
          typeof value.decodeText === 'function'
            ? value.decodeText()
            : typeof value.asString === 'function'
              ? value.asString()
              : String(value);
        const clean = str.replace(/^\(|\)$/g, '').trim();
        if (clean) urls.push(clean);
      } catch (err) {
        log.warn('failed to read a link annotation', (err as Error).message);
      }
    }
  }
  return urls;
}

const normalizeUrl = (u: string): string =>
  u
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');

/**
 * Confirms every link the resume promises is present, correct and untruncated.
 * A generation is not "complete" until this returns PASSED.
 */
export async function validateLinks(
  pdf: Buffer,
  expected: Array<{ label: string; url: string }>,
): Promise<LinkValidationResult> {
  const extracted = await extractPdfLinks(pdf);
  const extractedNorm = extracted.map(normalizeUrl);

  const invalidLinks: LinkValidationResult['invalidLinks'] = [];
  let validLinks = 0;

  for (const exp of expected) {
    const wanted = normalizeUrl(exp.url);
    const exactIndex = extractedNorm.indexOf(wanted);

    if (exactIndex >= 0) {
      validLinks++;
      continue;
    }

    // A prefix match means the URL made it into the PDF but was cut short —
    // usually a line-break in the source. Report it distinctly: a truncated
    // link looks fine visually and fails only when a recruiter clicks it.
    const truncated = extractedNorm.find(
      (e) => e.length > 0 && (wanted.startsWith(e) || e.startsWith(wanted)),
    );
    if (truncated) {
      invalidLinks.push({
        label: exp.label,
        expected: exp.url,
        found: extracted[extractedNorm.indexOf(truncated)],
        issue: 'URL is truncated or does not match exactly',
      });
    } else {
      invalidLinks.push({
        label: exp.label,
        expected: exp.url,
        issue: 'Link is missing from the generated PDF',
      });
    }
  }

  const mailtoExpected = expected.filter((e) => e.url.startsWith('mailto:'));
  for (const m of mailtoExpected) {
    const present = extracted.some((e) => e.toLowerCase().startsWith('mailto:'));
    if (!present && !invalidLinks.some((i) => i.expected === m.url)) {
      invalidLinks.push({
        label: m.label,
        expected: m.url,
        issue: 'Email link is not using the mailto: scheme',
      });
    }
  }

  return {
    expectedLinks: expected.length,
    foundLinks: extracted.length,
    validLinks,
    invalidLinks,
    status: invalidLinks.length === 0 && validLinks === expected.length ? 'PASSED' : 'FAILED',
    extracted,
  };
}
