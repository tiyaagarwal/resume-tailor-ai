import type { ProfileLink } from '../types/resume.ts';
import { badRequest } from '../utils/errors.ts';
import { collapseWhitespace } from '../utils/text.ts';
import { readTextEntry, readZipEntries } from './zip.ts';

/**
 * DOCX extraction that preserves hyperlinks.
 *
 * Word stores link targets in word/_rels/document.xml.rels and references them
 * from <w:hyperlink r:id="rIdN">. Naive text extraction keeps the visible label
 * and silently discards the URL, which is exactly the failure this project
 * cannot tolerate — so we resolve the relationship ids explicitly.
 */

export interface ExtractedDocument {
  text: string;
  links: ProfileLink[];
}

const decodeXml = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&');

function parseRelationships(relsXml: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!relsXml) return map;
  const re = /<Relationship\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(relsXml))) {
    const tag = m[0];
    const id = /\bId="([^"]+)"/.exec(tag)?.[1];
    const target = /\bTarget="([^"]+)"/.exec(tag)?.[1];
    const type = /\bType="([^"]+)"/.exec(tag)?.[1] ?? '';
    if (id && target && type.endsWith('/hyperlink')) map.set(id, decodeXml(target));
  }
  return map;
}

/** Concatenates the <w:t> runs inside an arbitrary XML fragment. */
function runText(fragment: string): string {
  const out: string[] = [];
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment))) out.push(decodeXml(m[1]));
  return out.join('');
}

export function extractDocx(buf: Buffer): ExtractedDocument {
  const entries = readZipEntries(buf);
  const documentXml = readTextEntry(buf, entries, 'word/document.xml');
  if (!documentXml) {
    throw badRequest('This DOCX has no readable document body (word/document.xml is missing).');
  }
  const rels = parseRelationships(readTextEntry(buf, entries, 'word/_rels/document.xml.rels'));

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

  // Hyperlinked runs: pair the visible label with its resolved target.
  const hyperlinkRe = /<w:hyperlink\b([^>]*)>([\s\S]*?)<\/w:hyperlink>/g;
  let hm: RegExpExecArray | null;
  while ((hm = hyperlinkRe.exec(documentXml))) {
    const rid = /r:id="([^"]+)"/.exec(hm[1])?.[1];
    const anchor = /w:anchor="([^"]+)"/.exec(hm[1])?.[1];
    const label = runText(hm[2]);
    const target = rid ? rels.get(rid) : undefined;
    if (target) pushLink(label, target);
    else if (anchor && /^(https?:|mailto:)/i.test(anchor)) pushLink(label, anchor);
  }

  // Build the plain-text body, one line per paragraph.
  const paragraphs: string[] = [];
  const paraRe = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  let pm: RegExpExecArray | null;
  while ((pm = paraRe.exec(documentXml))) {
    let body = pm[1];
    // Word breaks/tabs become spaces so bullet content stays on one line.
    body = body.replace(/<w:br\s*\/>/g, ' ').replace(/<w:tab\s*\/>/g, ' ');
    const t = runText(body).trim();
    paragraphs.push(t);
  }

  const text = collapseWhitespace(paragraphs.join('\n'));
  if (!text) {
    throw badRequest(
      'No text could be read from this DOCX. If it is a scanned image inside a Word file, please upload a text-based resume instead.',
    );
  }

  // Bare URLs typed as plain text still count as links the user expects to work.
  for (const m of text.matchAll(/https?:\/\/[^\s<>()\[\],;"']+/g)) pushLink(m[0], m[0]);
  for (const m of text.matchAll(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g)) {
    pushLink(m[0], `mailto:${m[0]}`);
  }

  return { text, links };
}
