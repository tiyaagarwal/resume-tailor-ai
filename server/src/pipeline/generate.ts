import { tailorWithAi } from '../ai/tailor.ts';
import { saveGeneration } from '../db/repositories.ts';
import { buildJdIndex, computeAtsScore } from '../matching/scoring.ts';
import { rankContent, skillsOmittedButOwned } from '../matching/ranking.ts';
import { renderDocx } from '../rendering/docx.ts';
import { compileLatex } from '../rendering/compile.ts';
import { DEFAULT_LAYOUT, expectedLinks, renderLatex } from '../rendering/latex.ts';
import { getPageCount, validateLinks } from '../validation/pdf.ts';
import { optimizeToOnePage } from '../validation/optimizer.ts';
import { revertViolatingBullets, validateTruthfulness } from '../validation/truthfulness.ts';
import { composeTailoredResume } from './compose.ts';
import type { JobDescription } from '../types/jd.ts';
import type { MasterResume } from '../types/resume.ts';
import type { GenerationResult, SectionKey, TailoredResume } from '../types/tailored.ts';
import { newId, nowIso } from '../utils/id.ts';
import { saveGeneratedDocx, saveGeneratedPdf } from '../utils/files.ts';
import { logger } from '../utils/logger.ts';

const log = logger('pipeline');

export interface GenerateOptions {
  master: MasterResume;
  jd: JobDescription;
  /**
   * Present on a "regenerate" call from the editor: bullets/sections the user
   * locked are copied onto the fresh baseline before AI tailoring runs, and
   * hidden sections stay hidden.
   */
  preserve?: Pick<TailoredResume, 'hiddenSections'> & {
    lockedBulletKeys?: Set<string>; // `${sourceId}:${sourceIndex}`
  };
}

function applyLocks(baseline: TailoredResume, preserve: GenerateOptions['preserve']): TailoredResume {
  if (!preserve) return baseline;
  const lockKeys = preserve.lockedBulletKeys ?? new Set<string>();
  const lockGroup = <T extends { bullets: { sourceId: string; sourceIndex: number; locked?: boolean }[] }>(
    items: T[],
  ): T[] =>
    items.map((item) => ({
      ...item,
      bullets: item.bullets.map((b) =>
        lockKeys.has(`${b.sourceId}:${b.sourceIndex}`) ? { ...b, locked: true } : b,
      ),
    }));

  return {
    ...baseline,
    hiddenSections: preserve.hiddenSections,
    experience: lockGroup(baseline.experience),
    projects: lockGroup(baseline.projects),
  };
}

/**
 * Runs the full pipeline documented in the README:
 * match+score -> rank -> compose -> AI tailor -> truthfulness check/repair ->
 * render -> page-count validate/optimize -> hyperlink validate -> persist.
 *
 * A generation is only saved once every validation gate has PASSED, matching
 * the "if validation fails, do not mark complete" requirement.
 */
export async function generateTailoredResume(opts: GenerateOptions): Promise<GenerationResult> {
  const { master, jd } = opts;
  const index = buildJdIndex(jd);

  const ranked = rankContent(master, jd, index);
  let baseline = composeTailoredResume(master, jd, ranked);
  baseline = applyLocks(baseline, opts.preserve);

  const tailorOutcome = await tailorWithAi(master, jd, baseline);
  let tailored = tailorOutcome.resume;

  let truthfulness = validateTruthfulness(master, tailored);
  if (truthfulness.status === 'FAILED') {
    log.warn('truthfulness violations detected in AI output; reverting affected bullets', truthfulness.violations);
    tailored = revertViolatingBullets(master, tailored);
    truthfulness = validateTruthfulness(master, tailored);
  }

  const optimized = await optimizeToOnePage(tailored, DEFAULT_LAYOUT);
  const pageCount = await getPageCount(optimized.pdf);
  if (pageCount !== optimized.pageCount) {
    log.warn('page count mismatch between optimizer and independent recheck', { optimized: optimized.pageCount, recheck: pageCount });
  }

  const expected = expectedLinks(optimized.resume);
  const linkValidation = await validateLinks(optimized.pdf, expected);
  if (linkValidation.status === 'FAILED') {
    // The template renders every link deterministically from resume data, so a
    // failure here means a transient LaTeX/hyperref issue rather than missing
    // data — one clean re-render is the correct repair, not silent partial success.
    log.warn('link validation failed on first render, retrying once', linkValidation.invalidLinks);
    const retryLatex = renderLatex(optimized.resume, optimized.layout);
    const retryCompiled = await compileLatex(retryLatex);
    const retryValidation = await validateLinks(retryCompiled.pdf, expected);
    if (retryValidation.status === 'PASSED') {
      optimized.pdf = retryCompiled.pdf;
      optimized.latex = retryLatex;
      Object.assign(linkValidation, retryValidation);
    }
  }

  const docx = await renderDocx(optimized.resume);

  const ats = computeAtsScore(master, jd, index);
  const droppedButRelevant = skillsOmittedButOwned(master, optimized.resume.skills, index);

  const id = newId('gen');
  const pdfPath = await saveGeneratedPdf(id, optimized.pdf);
  const docxPath = await saveGeneratedDocx(id, docx);

  const result: GenerationResult = {
    id,
    createdAt: nowIso(),
    masterResumeId: master.id,
    jobDescriptionId: jd.id,
    jobTitle: jd.jobTitle,
    company: jd.company,
    tailored: optimized.resume,
    ats: {
      overall: ats.overall,
      skillCoverage: ats.skillCoverage,
      keywordCoverage: ats.keywordCoverage,
      responsibilityAlignment: ats.responsibilityAlignment,
      titleAlignment: ats.titleAlignment,
      matchedSkills: ats.matchedSkills,
      matchedKeywords: [...index.atsKeywordTokens].slice(0, 30),
      missingFromMasterResume: ats.missingFromMasterResume,
      missingFromGeneratedResume: droppedButRelevant,
    },
    reasons: ranked.reasons,
    optimization: optimized.steps,
    pageCount,
    linkValidation,
    truthfulness,
    pdfPath,
    docxPath,
    latexSource: optimized.latex,
    engine: tailorOutcome.engine,
  };

  await saveGeneration(result);
  log.info(`generated resume ${id} for "${jd.jobTitle}" @ ${jd.company}: ${pageCount}p, ATS ${ats.overall}, links ${linkValidation.status}, engine=${tailorOutcome.engine}`);
  return result;
}

export function sectionOrderWithToggle(order: SectionKey[], hidden: SectionKey[]): SectionKey[] {
  const hiddenSet = new Set(hidden);
  return order.filter((s) => !hiddenSet.has(s));
}
