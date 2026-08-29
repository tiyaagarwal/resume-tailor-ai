import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { env } from '../config/env.ts';

const root = resolve(process.cwd(), env.dataDir);
export const uploadsDir = join(root, 'uploads');
export const generatedDir = join(root, 'generated');

export async function ensureDataDirs(): Promise<void> {
  await mkdir(uploadsDir, { recursive: true });
  await mkdir(generatedDir, { recursive: true });
}

export async function saveGeneratedPdf(id: string, pdf: Buffer): Promise<string> {
  const path = join(generatedDir, `${id}.pdf`);
  await writeFile(path, pdf);
  return path;
}

export async function saveGeneratedDocx(id: string, docx: Buffer): Promise<string> {
  const path = join(generatedDir, `${id}.docx`);
  await writeFile(path, docx);
  return path;
}
