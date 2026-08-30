import type { Request, Response } from 'express';
import { getJobDescription, getMasterResume, getGeneration, saveGeneration } from '../db/repositories.ts';
import { generateTailoredResume } from '../pipeline/generate.ts';
import { tailorWithAi } from '../ai/tailor.ts';
import { critiqueResume } from '../ai/critique.ts';
import { findGapFillingContent } from '../matching/gaps.ts';
import { buildJdIndex } from '../matching/scoring.ts';
import { validateTruthfulness, revertViolatingBullets } from '../validation/truthfulness.ts';
import { optimizeToOnePage } from '../validation/optimizer.ts';
import { DEFAULT_LAYOUT, expectedLinks } from '../rendering/latex.ts';
import { renderDocx } from '../rendering/docx.ts';
import { validateLinks } from '../validation/pdf.ts';
import { saveGeneratedDocx, saveGeneratedPdf } from '../utils/files.ts';
import { badRequest } from '../utils/errors.ts';
import type { SectionKey, TailoredBullet, TailoredExperience, TailoredProject, TailoredResume } from '../types/tailored.ts';
import type { GapSuggestion } from '../types/critique.ts';
import type { MasterResume } from '../types/resume.ts';

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

/**
 * POST /api/generations/:id/critique — asks Claude to act as a strict
 * reviewer of the already-generated resume against its own job description:
 * an ATS-style score, strengths, and concrete improvement areas. No offline
 * fallback (see ai/critique.ts) — a missing ANTHROPIC_API_KEY surfaces as a
 * real 502 error, same as any other Claude-dependent failure in this app.
 */
export async function critiqueHandler(req: Request, res: Response): Promise<void> {
  const existing = await getGeneration(req.params.id);
  const jd = await getJobDescription(existing.jobDescriptionId);
  const critique = await critiqueResume(existing.tailored, jd);
  const updated = { ...existing, critique };
  await saveGeneration(updated);
  res.json({ generation: updated });
}

/**
 * POST /api/generations/:id/gap-suggestions — searches a second (possibly
 * different, bigger) master resume for real content that would address the
 * critique's improvement areas. Stateless: recomputed on demand from
 * `req.body.masterResumeId`, never persisted, so suggestions can never go
 * stale against edits made in between.
 */
export async function gapSuggestionsHandler(req: Request, res: Response): Promise<void> {
  const existing = await getGeneration(req.params.id);
  if (!existing.critique) throw badRequest('Run a critique first.');

  const { masterResumeId } = req.body ?? {};
  if (typeof masterResumeId !== 'string') {
    throw badRequest('"masterResumeId" is required — pick or upload the resume to search for content in.');
  }

  const [sourceMaster, jd] = await Promise.all([
    getMasterResume(masterResumeId),
    getJobDescription(existing.jobDescriptionId),
  ]);
  const index = buildJdIndex(jd);
  const suggestions = findGapFillingContent(sourceMaster, existing.critique, existing.tailored, index);
  res.json({ suggestions });
}

/** Finds the source entry (from either the experience or internships array)
 *  a suggestion's `sourceId` points at, since gap-suggestions merges both
 *  arrays into one candidate pool (see matching/gaps.ts). */
function findSourceExperience(sourceMaster: MasterResume, id: string) {
  return sourceMaster.experience.find((e) => e.id === id) ?? sourceMaster.internships.find((e) => e.id === id);
}

function toTailoredBullet(text: string, sourceId: string, sourceBullets: string[], relevance: number): TailoredBullet {
  const sourceIndex = sourceBullets.indexOf(text);
  return {
    text,
    sourceId,
    sourceIndex: sourceIndex >= 0 ? sourceIndex : 0,
    original: text,
    relevance,
    // Verbatim, real content the user explicitly chose to add — never
    // touched by a later AI-tailoring pass, same as any user-locked bullet.
    locked: true,
  };
}

/**
 * Merges accepted gap suggestions into a tailored resume. Every addition is
 * idempotent (re-checks presence rather than trusting the client's
 * `alreadyIncluded` snapshot, which could be stale) and additive-only — this
 * function never removes anything.
 */
function mergeSuggestionsIntoResume(
  tailored: TailoredResume,
  sourceMaster: MasterResume,
  suggestions: GapSuggestion[],
): TailoredResume {
  const merged: TailoredResume = structuredClone(tailored);

  for (const s of suggestions) {
    if (s.kind === 'bullet' && s.sourceParentId) {
      const expTarget = merged.experience.find((e) => e.id === s.sourceParentId);
      const projTarget = merged.projects.find((p) => p.id === s.sourceParentId);
      const target = expTarget ?? projTarget;
      if (!target) continue;
      if (target.bullets.some((b) => b.original === s.text)) continue;
      const sourceExp = findSourceExperience(sourceMaster, s.sourceId);
      const sourceProj = sourceMaster.projects.find((p) => p.id === s.sourceId);
      const sourceBullets = sourceExp?.bullets ?? sourceProj?.bullets ?? [];
      target.bullets.push(toTailoredBullet(s.text, s.sourceId, sourceBullets, s.relevance));
    } else if (s.kind === 'experience') {
      if (merged.experience.some((e) => e.id === s.sourceId)) continue;
      const source = findSourceExperience(sourceMaster, s.sourceId);
      if (!source) continue;
      const entry: TailoredExperience = {
        id: source.id,
        kind: source.kind,
        role: source.role,
        organization: source.organization,
        location: source.location,
        startDate: source.startDate,
        endDate: source.endDate,
        certificateUrl: source.certificateUrl,
        relevance: s.relevance,
        bullets: source.bullets.map((text) => toTailoredBullet(text, source.id, source.bullets, s.relevance)),
      };
      merged.experience.push(entry);
    } else if (s.kind === 'project') {
      if (merged.projects.some((p) => p.id === s.sourceId)) continue;
      const source = sourceMaster.projects.find((p) => p.id === s.sourceId);
      if (!source) continue;
      const entry: TailoredProject = {
        id: source.id,
        name: source.name,
        tagline: source.tagline,
        technologies: source.technologies,
        repoUrl: source.repoUrl,
        liveUrl: source.liveUrl,
        startDate: source.startDate,
        endDate: source.endDate,
        relevance: s.relevance,
        bullets: source.bullets.map((text) => toTailoredBullet(text, source.id, source.bullets, s.relevance)),
      };
      merged.projects.push(entry);
    } else if (s.kind === 'skill') {
      const category = merged.skills.find((c) => c.name === s.sourceId);
      if (!category) {
        merged.skills.push({ name: s.sourceId, items: [s.text] });
      } else if (
        !category.items.some((i) => i.toLowerCase() === s.text.toLowerCase()) &&
        !(category.fabricated ?? []).some((i) => i.toLowerCase() === s.text.toLowerCase())
      ) {
        category.items.push(s.text);
      }
    } else if (s.kind === 'certification') {
      if (merged.certifications.some((c) => c.id === s.sourceId)) continue;
      const source = sourceMaster.certifications.find((c) => c.id === s.sourceId);
      if (source) merged.certifications.push(source);
    } else if (s.kind === 'workshop') {
      if (merged.workshops.some((w) => w.id === s.sourceId)) continue;
      const source = sourceMaster.workshops.find((w) => w.id === s.sourceId);
      if (source) merged.workshops.push(source);
    } else if (s.kind === 'hackathon') {
      if (merged.hackathons.some((h) => h.id === s.sourceId)) continue;
      const source = sourceMaster.hackathons.find((h) => h.id === s.sourceId);
      if (source) merged.hackathons.push(source);
    } else if (s.kind === 'extracurricular') {
      if (merged.extraCurricular.some((e) => e.id === s.sourceId)) continue;
      const fromExtra = sourceMaster.extraCurricular.find((e) => e.id === s.sourceId);
      if (fromExtra) {
        merged.extraCurricular.push(fromExtra);
        continue;
      }
      const fromAchievement = sourceMaster.achievements.find((a) => a.id === s.sourceId);
      if (fromAchievement) {
        merged.extraCurricular.push({ id: fromAchievement.id, role: '', impact: fromAchievement.text, date: fromAchievement.date });
      }
    }
  }

  return merged;
}

/**
 * POST /api/generations/:id/regenerate-additive — merges accepted gap
 * suggestions into the tailored resume and re-renders, WITHOUT removing
 * anything: `optimizeToOnePage` runs in `preserveContent` mode (cosmetic
 * compression only). If the result still doesn't fit at the compression
 * floor, this responds honestly with `pageCount > 1` rather than cutting
 * content — the caller decides what to do about it.
 */
export async function regenerateAdditiveHandler(req: Request, res: Response): Promise<void> {
  const existing = await getGeneration(req.params.id);
  const { masterResumeId, acceptedSuggestions } = req.body ?? {};
  if (typeof masterResumeId !== 'string' || !Array.isArray(acceptedSuggestions)) {
    throw badRequest('"masterResumeId" and "acceptedSuggestions" are required.');
  }

  const [sourceMaster, master, jd] = await Promise.all([
    getMasterResume(masterResumeId),
    getMasterResume(existing.masterResumeId),
    getJobDescription(existing.jobDescriptionId),
  ]);

  const merged = mergeSuggestionsIntoResume(existing.tailored, sourceMaster, acceptedSuggestions as GapSuggestion[]);

  const tailorOutcome = await tailorWithAi(master, jd, merged);
  let tailored = tailorOutcome.resume;

  let truthfulness = validateTruthfulness(master, tailored);
  if (truthfulness.status === 'FAILED') {
    tailored = revertViolatingBullets(master, tailored);
    truthfulness = validateTruthfulness(master, tailored);
  }

  const optimized = await optimizeToOnePage(tailored, DEFAULT_LAYOUT, { preserveContent: true });
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
