import type { Request, Response } from 'express';
import { getJobDescription, getMasterResume, getGeneration, saveGeneration } from '../db/repositories.ts';
import { generateTailoredResume } from '../pipeline/generate.ts';
import { tailorWithAi } from '../ai/tailor.ts';
import { validateTruthfulness, revertViolatingBullets } from '../validation/truthfulness.ts';
import { optimizeToOnePage } from '../validation/optimizer.ts';
import { DEFAULT_LAYOUT, expectedLinks } from '../rendering/latex.ts';
import { renderDocx } from '../rendering/docx.ts';
import { validateLinks } from '../validation/pdf.ts';
import { saveGeneratedDocx, saveGeneratedPdf } from '../utils/files.ts';
import { badRequest } from '../utils/errors.ts';
import type { SectionKey, TailoredResume } from '../types/tailored.ts';

/** POST /api/generate — master resume + job description in, validated GenerationResult out. */
export async function generateHandler(req: Request, res: Response): Promise<void> {
  const { masterResumeId, jobDescriptionId } = req.body ?? {};
  if (typeof masterResumeId !== 'string' || typeof jobDescriptionId !== 'string') {
    throw badRequest('Both "masterResumeId" and "jobDescriptionId" are required.');
  }
  const [master, jd] = await Promise.all([
    getMasterResume(masterResumeId),
    getJobDescription(jobDescriptionId),
  ]);
  const result = await generateTailoredResume({ master, jd });
  res.status(201).json({ generation: result });
}

/**
 * POST /api/generations/:id/regenerate — re-runs AI tailoring + validation on an
 * edited TailoredResume from the editor (respecting locked bullets and hidden
 * sections the user set), without re-running selection/ranking.
 */
export async function regenerateHandler(req: Request, res: Response): Promise<void> {
  const existing = await getGeneration(req.params.id);
  const master = await getMasterResume(existing.masterResumeId);
  const jd = await getJobDescription(existing.jobDescriptionId);

  const edited: TailoredResume | undefined = req.body?.tailored;
  const base = edited ?? existing.tailored;

  const tailorOutcome = await tailorWithAi(master, jd, base);
  let tailored = tailorOutcome.resume;

  let truthfulness = validateTruthfulness(master, tailored);
  if (truthfulness.status === 'FAILED') {
    tailored = revertViolatingBullets(master, tailored);
    truthfulness = validateTruthfulness(master, tailored);
  }

  const optimized = await optimizeToOnePage(tailored, DEFAULT_LAYOUT);
  const expected = expectedLinks(optimized.resume);
  const linkValidation = await validateLinks(optimized.pdf, expected);
  const docx = await renderDocx(optimized.resume);

  const pdfPath = await saveGeneratedPdf(existing.id, optimized.pdf);
  const docxPath = await saveGeneratedDocx(existing.id, docx);

  const updated = {
    ...existing,
    tailored: optimized.resume,
    optimization: optimized.steps,
    pageCount: optimized.pageCount,
    linkValidation,
    truthfulness,
    pdfPath,
    docxPath,
    latexSource: optimized.latex,
    engine: tailorOutcome.engine,
  };
  await saveGeneration(updated);
  res.json({ generation: updated });
}

/**
 * POST /api/generations/:id/optimize — user-triggered "Optimize to One Page"
 * button in the editor: re-renders and applies the automatic optimizer to
 * whatever content the user currently has, without invoking the AI again.
 */
export async function optimizeHandler(req: Request, res: Response): Promise<void> {
  const existing = await getGeneration(req.params.id);
  const edited: TailoredResume = req.body?.tailored ?? existing.tailored;

  const optimized = await optimizeToOnePage(edited, DEFAULT_LAYOUT);
  const expected = expectedLinks(optimized.resume);
  const linkValidation = await validateLinks(optimized.pdf, expected);
  const docx = await renderDocx(optimized.resume);

  const pdfPath = await saveGeneratedPdf(existing.id, optimized.pdf);
  const docxPath = await saveGeneratedDocx(existing.id, docx);

  const updated = {
    ...existing,
    tailored: optimized.resume,
    optimization: optimized.steps,
    pageCount: optimized.pageCount,
    linkValidation,
    pdfPath,
    docxPath,
    latexSource: optimized.latex,
  };
  await saveGeneration(updated);
  res.json({ generation: updated });
}

/** PATCH /api/generations/:id/sections — toggle section visibility from the editor. */
export async function toggleSectionsHandler(req: Request, res: Response): Promise<void> {
  const existing = await getGeneration(req.params.id);
  const hiddenSections: SectionKey[] = req.body?.hiddenSections ?? [];
  const updated = { ...existing, tailored: { ...existing.tailored, hiddenSections } };
  await saveGeneration(updated);
  res.json({ generation: updated });
}
