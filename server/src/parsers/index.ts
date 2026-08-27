import type { MasterResume } from '../types/resume.ts';
import { badRequest } from '../utils/errors.ts';
import type { ExtractedDocument } from './docx.ts';
import { extractDocx } from './docx.ts';
import { extractPdf } from './pdf.ts';
import { structureResume } from './structure.ts';

export type SupportedKind = 'pdf' | 'docx' | 'text';

const MAX_BYTES = 10 * 1024 * 1024;

export function detectKind(fileName: string, buf: Buffer): SupportedKind {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  // Trust magic bytes over the extension: users rename files constantly.
  if (buf.length >= 4) {
    const magic = buf.subarray(0, 4);
    if (magic.toString('latin1') === '%PDF') return 'pdf';
    if (magic[0] === 0x50 && magic[1] === 0x4b) return 'docx';
  }
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'txt' || ext === 'md') return 'text';
  throw badRequest(
    `Unsupported file type "${ext || 'unknown'}". Please upload a PDF or DOCX resume.`,
  );
}

export async function extractDocument(fileName: string, buf: Buffer): Promise<ExtractedDocument> {
  if (buf.length === 0) throw badRequest('The uploaded file is empty.');
  if (buf.length > MAX_BYTES) {
    throw badRequest(`File is too large (${(buf.length / 1e6).toFixed(1)} MB). The limit is 10 MB.`);
  }
  const kind = detectKind(fileName, buf);
  if (kind === 'pdf') return extractPdf(buf);
  if (kind === 'docx') return extractDocx(buf);

  const text = buf.toString('utf8');
  const links = [
    ...[...text.matchAll(/https?:\/\/[^\s<>()\[\],;"']+/g)].map((m) => ({ label: m[0], url: m[0] })),
    ...[...text.matchAll(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g)].map((m) => ({
      label: m[0],
      url: `mailto:${m[0]}`,
    })),
  ];
  return { text, links };
}

export async function parseMasterResume(fileName: string, buf: Buffer): Promise<MasterResume> {
  const extracted = await extractDocument(fileName, buf);
  const resume = structureResume({ ...extracted, sourceFileName: fileName });

  // A resume with no recognisable content almost always means a layout we
  // could not read, and silently returning an empty shell would be worse than
  // failing loudly here.
  const contentCount =
    resume.experience.length +
    resume.internships.length +
    resume.projects.length +
    resume.education.length;
  if (contentCount === 0) {
    throw badRequest(
      'We could not identify any sections in this resume. Make sure it has standard headings such as EDUCATION, EXPERIENCE, PROJECTS and SKILLS, then upload it again.',
    );
  }
  return resume;
}

export { extractDocx, extractPdf, structureResume };
export type { ExtractedDocument };
