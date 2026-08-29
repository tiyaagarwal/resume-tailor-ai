import { createReadStream } from 'node:fs';
import type { Request, Response } from 'express';
import {
  deleteGeneration,
  getGeneration,
  getJobDescription,
  getMasterResume,
  listAllGenerations,
  listGenerationsForMaster,
  saveGeneration,
} from '../db/repositories.ts';
import { generateTailoredResume } from '../pipeline/generate.ts';
import { newId } from '../utils/id.ts';

export async function listHistory(req: Request, res: Response): Promise<void> {
  const masterResumeId = typeof req.query.masterResumeId === 'string' ? req.query.masterResumeId : undefined;
  const generations = masterResumeId
    ? await listGenerationsForMaster(masterResumeId)
    : await listAllGenerations();

  res.json({
    generations: generations.map((g) => ({
      id: g.id,
      jobTitle: g.jobTitle,
      company: g.company,
      createdAt: g.createdAt,
      atsMatchScore: g.ats.overall,
      pageCount: g.pageCount,
      engine: g.engine,
      linkValidationStatus: g.linkValidation.status,
    })),
  });
}

export async function getGenerationHandler(req: Request, res: Response): Promise<void> {
  const generation = await getGeneration(req.params.id);
  res.json({ generation });
}

export async function downloadPdf(req: Request, res: Response): Promise<void> {
  const generation = await getGeneration(req.params.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${slugFileName(generation.jobTitle, generation.company)}.pdf"`,
  );
  createReadStream(generation.pdfPath).pipe(res);
}

export async function downloadDocx(req: Request, res: Response): Promise<void> {
  const generation = await getGeneration(req.params.id);
  if (!generation.docxPath) {
    res.status(404).json({ error: 'No DOCX was generated for this resume version.' });
    return;
  }
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${slugFileName(generation.jobTitle, generation.company)}.docx"`,
  );
  createReadStream(generation.docxPath).pipe(res);
}

/** Re-runs the full pipeline fresh for the same master resume + JD pairing. */
export async function regenerateFromHistory(req: Request, res: Response): Promise<void> {
  const existing = await getGeneration(req.params.id);
  const [master, jd] = await Promise.all([
    getMasterResume(existing.masterResumeId),
    getJobDescription(existing.jobDescriptionId),
  ]);
  const result = await generateTailoredResume({ master, jd });
  res.status(201).json({ generation: result });
}

/** Clones a generation's content as a new, independently editable history entry. */
export async function duplicateGeneration(req: Request, res: Response): Promise<void> {
  const existing = await getGeneration(req.params.id);
  const clone = { ...structuredClone(existing), id: newId('gen'), createdAt: new Date().toISOString() };
  await saveGeneration(clone);
  res.status(201).json({ generation: clone });
}

export async function deleteGenerationHandler(req: Request, res: Response): Promise<void> {
  await deleteGeneration(req.params.id);
  res.status(204).send();
}

function slugFileName(jobTitle: string, company: string): string {
  return `${jobTitle}-${company}-resume`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
